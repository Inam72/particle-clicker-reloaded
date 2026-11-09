using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;

public sealed class ClassroomHost
{
    private const int MaxMessageBytes = 16384;
    private const int MaxPlayers = 40;
    private const int MaxConnections = MaxPlayers + 5;
    private readonly string root;
    private readonly int port;
    private readonly string prefixHost;
    private readonly HttpListener listener = new HttpListener();
    private readonly ConcurrentDictionary<string, Client> clients = new ConcurrentDictionary<string, Client>();
    private readonly Dictionary<string, Room> rooms = new Dictionary<string, Room>();
    private readonly object roomsLock = new object();
    private volatile bool running;
    private Task acceptLoop;

    public event Action<string> Error;

    public ClassroomHost(string root, int port)
        : this(root, port, "+", null)
    {
    }

    public ClassroomHost(string root, int port, string prefixHost)
        : this(root, port, prefixHost, null)
    {
    }

    public ClassroomHost(string root, int port, string prefixHost, string stopToken)
    {
        this.root = Path.GetFullPath(root);
        this.port = port;
        this.prefixHost = prefixHost;
        StopToken = stopToken;
    }

    public string StopToken { get; set; }

    public bool IsRunning
    {
        get { return running; }
    }

    public void Start()
    {
        listener.Prefixes.Add("http://" + prefixHost + ":" + port + "/");
        listener.Start();
        running = true;
        acceptLoop = Task.Run((Func<Task>)AcceptLoop);
    }

    public void Stop()
    {
        running = false;
        listener.Close();
    }

    private async Task AcceptLoop()
    {
        while (running)
        {
            HttpListenerContext context;
            try
            {
                context = await listener.GetContextAsync().ConfigureAwait(false);
            }
            catch (HttpListenerException)
            {
                break;
            }
            catch (ObjectDisposedException)
            {
                break;
            }

            StartRequest(context);
        }
    }

    private async Task HandleStop(HttpListenerContext context)
    {
        if (!String.Equals(context.Request.HttpMethod, "POST", StringComparison.Ordinal) ||
            !HasValidStopRequest(context.Request))
        {
            await WriteResponse(context, "Not allowed.", "text/plain; charset=utf-8", 403).ConfigureAwait(false);
            return;
        }

        await WriteResponse(context, "Classroom stopped.", "text/plain; charset=utf-8", 202).ConfigureAwait(false);
        ThreadPool.QueueUserWorkItem(_ =>
        {
            Thread.Sleep(250);
            Stop();
        });
    }

    private bool HasValidStopRequest(HttpListenerRequest request)
    {
        if (String.IsNullOrEmpty(StopToken) ||
            !HasLocalBrowserOrigin(request))
        {
            return false;
        }

        string supplied = request.Headers["X-Classroom-Token"];
        if (String.IsNullOrEmpty(supplied) || supplied.Length != StopToken.Length)
        {
            return false;
        }

        int difference = 0;
        for (int i = 0; i < StopToken.Length; i++)
        {
            difference |= supplied[i] ^ StopToken[i];
        }
        return difference == 0;
    }

    private static bool HasLocalBrowserOrigin(HttpListenerRequest request)
    {
        Uri origin;
        if (!Uri.TryCreate(request.Headers["Origin"], UriKind.Absolute, out origin) ||
            origin.Scheme != Uri.UriSchemeHttp ||
            !String.Equals(origin.GetLeftPart(UriPartial.Authority),
                request.Url.GetLeftPart(UriPartial.Authority), StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        string host = request.Url.Host;
        if (String.Equals(host, "localhost", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        IPAddress address;
        if (!IPAddress.TryParse(host, out address))
        {
            return false;
        }

        byte[] bytes = address.GetAddressBytes();
        return bytes.Length == 4 &&
            (bytes[0] == 10 ||
             (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) ||
             (bytes[0] == 192 && bytes[1] == 168));
    }

    private static string BuildClassroomModeScript()
    {
        return "(function(){var p=new URLSearchParams(location.search);" +
            "var f=new URLSearchParams(location.hash.slice(1));" +
            "var stop=f.get('stop');" +
            "window.__CLASSROOM_LOCAL__=p.get('classroom')==='local';" +
            "window.__CLASSROOM_TEACHER__=window.__CLASSROOM_LOCAL__&&p.get('teacher')==='1';" +
            "window.__CLASSROOM_HOST_URL__=location.origin+location.pathname+'?classroom=local';" +
            "window.__CLASSROOM_ROOM__=window.__CLASSROOM_LOCAL__?(f.get('room')||''):'';" +
            "window.__CLASSROOM_STOP_TOKEN__='';" +
            "if(window.__CLASSROOM_TEACHER__){try{" +
            "if(stop){sessionStorage.setItem('pc-classroom-stop',stop);}" +
            "window.__CLASSROOM_STOP_TOKEN__=stop||sessionStorage.getItem('pc-classroom-stop')||'';" +
            "}catch(e){window.__CLASSROOM_STOP_TOKEN__=stop||'';}}" +
            "if(stop&&window.__CLASSROOM_TEACHER__){" +
            "history.replaceState(null,document.title,location.pathname+location.search);}})();";
    }

    private void StartRequest(HttpListenerContext context)
    {
        Task.Run(() => HandleRequest(context));
    }

    private async Task HandleRequest(HttpListenerContext context)
    {
        try
        {
            if (String.Equals(context.Request.Url.AbsolutePath, "/classroom/stop", StringComparison.Ordinal))
            {
                await HandleStop(context).ConfigureAwait(false);
                return;
            }

            if (context.Request.IsWebSocketRequest &&
                String.Equals(context.Request.Url.AbsolutePath, "/classroom", StringComparison.Ordinal))
            {
                if (!HasLocalBrowserOrigin(context.Request))
                {
                    await WriteResponse(context, "Local classroom connections only.",
                        "text/plain; charset=utf-8", 403).ConfigureAwait(false);
                    return;
                }
                await HandleSocket(context).ConfigureAwait(false);
                return;
            }

            if (String.Equals(context.Request.Url.AbsolutePath, "/classroom-mode.js", StringComparison.Ordinal))
            {
                await WriteResponse(context, BuildClassroomModeScript(), "text/javascript; charset=utf-8", 200).ConfigureAwait(false);
                return;
            }

            await ServeFile(context).ConfigureAwait(false);
        }
        catch (Exception error)
        {
            ReportError(error.Message);
            if (context.Response.OutputStream.CanWrite)
            {
                try { WriteResponse(context, "Unable to load this game file.", "text/plain; charset=utf-8", 500).GetAwaiter().GetResult(); } catch { }
            }
        }
    }

    private async Task ServeFile(HttpListenerContext context)
    {
        string relative = Uri.UnescapeDataString(context.Request.Url.AbsolutePath.TrimStart('/')).Replace('/', Path.DirectorySeparatorChar);
        if (String.IsNullOrEmpty(relative))
        {
            relative = "index.html";
        }

        string first = relative.Split(Path.DirectorySeparatorChar)[0];
        if (relative.Contains("..") || !IsAllowedPath(relative, first))
        {
            await WriteResponse(context, "Not found.", "text/plain; charset=utf-8", 404).ConfigureAwait(false);
            return;
        }

        string fullPath = Path.GetFullPath(Path.Combine(root, relative));
        if (!fullPath.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) ||
            !File.Exists(fullPath))
        {
            await WriteResponse(context, "Not found.", "text/plain; charset=utf-8", 404).ConfigureAwait(false);
            return;
        }

        byte[] content = File.ReadAllBytes(fullPath);
        if (String.Equals(relative, "index.html", StringComparison.OrdinalIgnoreCase))
        {
            string html = Encoding.UTF8.GetString(content);
            html = html.Replace(
                "https://maxcdn.bootstrapcdn.com/font-awesome/4.2.0/css/font-awesome.min.css",
                "css/classroom-icons.css");
            content = Encoding.UTF8.GetBytes(html);
            context.Response.Headers["Cache-Control"] = "no-store";
        }
        string mime = GetMimeType(fullPath);
        context.Response.ContentType = mime;
        context.Response.ContentLength64 = content.Length;
        context.Response.Headers["X-Content-Type-Options"] = "nosniff";
        await context.Response.OutputStream.WriteAsync(content, 0, content.Length).ConfigureAwait(false);
        context.Response.Close();
    }

    private bool IsAllowedPath(string relative, string first)
    {
        if (String.Equals(relative, "index.html", StringComparison.OrdinalIgnoreCase) ||
            String.Equals(relative, "favicon.ico", StringComparison.OrdinalIgnoreCase) ||
            String.Equals(relative, "classroom-mode.js", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return first == "html" || first == "css" || first == "js" ||
            first == "json" || first == "assets" || first == "fonts";
    }

    private static string GetMimeType(string path)
    {
        switch (Path.GetExtension(path).ToLowerInvariant())
        {
            case ".html": return "text/html; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".js": return "text/javascript; charset=utf-8";
            case ".mjs": return "text/javascript; charset=utf-8";
            case ".json": return "application/json; charset=utf-8";
            case ".svg": return "image/svg+xml";
            case ".png": return "image/png";
            case ".jpg":
            case ".jpeg": return "image/jpeg";
            case ".gif": return "image/gif";
            case ".ico": return "image/x-icon";
            case ".woff": return "font/woff";
            case ".woff2": return "font/woff2";
            case ".ttf": return "font/ttf";
            case ".mp3": return "audio/mpeg";
            case ".mp4": return "video/mp4";
            default: return "application/octet-stream";
        }
    }

    private static async Task WriteResponse(HttpListenerContext context, string text, string contentType, int status)
    {
        byte[] bytes = Encoding.UTF8.GetBytes(text);
        context.Response.StatusCode = status;
        context.Response.ContentType = contentType;
        context.Response.ContentLength64 = bytes.Length;
        context.Response.Headers["Cache-Control"] = "no-store";
        await context.Response.OutputStream.WriteAsync(bytes, 0, bytes.Length).ConfigureAwait(false);
        context.Response.Close();
    }

    private async Task HandleSocket(HttpListenerContext context)
    {
        WebSocketContext accepted = await context.AcceptWebSocketAsync(null).ConfigureAwait(false);
        Client client = new Client(Guid.NewGuid().ToString("N"), accepted.WebSocket);
        clients[client.Id] = client;
        if (clients.Count > MaxConnections)
        {
            SendError(client, "This classroom host is full.");
            try { await client.Socket.CloseAsync(WebSocketCloseStatus.PolicyViolation, "Classroom is full", CancellationToken.None).ConfigureAwait(false); } catch { }
            Client ignored;
            clients.TryRemove(client.Id, out ignored);
            return;
        }

        byte[] buffer = new byte[4096];
        MemoryStream message = new MemoryStream();
        try
        {
            while (client.Socket.State == WebSocketState.Open)
            {
                WebSocketReceiveResult result = await client.Socket.ReceiveAsync(
                    new ArraySegment<byte>(buffer), CancellationToken.None).ConfigureAwait(false);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    if (client.Socket.State == WebSocketState.CloseReceived)
                    {
                        await client.Socket.CloseAsync(
                            result.CloseStatus ?? WebSocketCloseStatus.NormalClosure,
                            result.CloseStatusDescription,
                            CancellationToken.None).ConfigureAwait(false);
                    }
                    break;
                }

                if (message.Length + result.Count > MaxMessageBytes)
                {
                    await client.Socket.CloseAsync(WebSocketCloseStatus.MessageTooBig, "Message too large", CancellationToken.None).ConfigureAwait(false);
                    break;
                }

                message.Write(buffer, 0, result.Count);
                if (result.EndOfMessage)
                {
                    string text = Encoding.UTF8.GetString(message.ToArray());
                    message.SetLength(0);
                    HandleMessage(client, Parse(text));
                }
            }
        }
        catch (WebSocketException) { }
        catch (Exception error)
        {
            ReportError(error.Message);
            SendError(client, "The classroom connection ended unexpectedly. Try joining again.");
        }
        finally
        {
            message.Dispose();
            RemoveClient(client);
            Client ignored;
            clients.TryRemove(client.Id, out ignored);
            try { client.Socket.Dispose(); } catch { }
        }
    }

    private static Dictionary<string, object> Parse(string text)
    {
        return new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(text);
    }

    private void HandleMessage(Client client, Dictionary<string, object> message)
    {
        if (message == null || !message.ContainsKey("type"))
        {
            return;
        }

        string type = Convert.ToString(message["type"]);
        if (type == "create")
        {
            CreateRoom(client, message);
        }
        else if (type == "join")
        {
            JoinRoom(client, message);
        }
        else if (type == "progress")
        {
            UpdateProgress(client, message);
        }
        else if (type == "leave")
        {
            RemoveClient(client);
        }
    }

    private void CreateRoom(Client client, Dictionary<string, object> message)
    {
        string code = GetString(message, "room", 8).ToUpperInvariant();
        object settingsObject;
        Dictionary<string, object> settings;
        if (code.Length < 4 || !message.TryGetValue("settings", out settingsObject))
        {
            SendError(client, "That room code or game setting is not valid.");
            return;
        }

        settings = settingsObject as Dictionary<string, object>;
        if (settings == null || !IsValidStat(GetString(settings, "statKey", 32)))
        {
            SendError(client, "Choose a valid score to compare.");
            return;
        }
        object goal;
        if (settings.TryGetValue("goal", out goal) && goal != null)
        {
            double goalValue;
            if (!Double.TryParse(Convert.ToString(goal, System.Globalization.CultureInfo.InvariantCulture),
                    System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out goalValue) ||
                Double.IsNaN(goalValue) || Double.IsInfinity(goalValue) ||
                goalValue < 1 || goalValue > 1000000000000)
            {
                SendError(client, "Enter a race goal greater than zero.");
                return;
            }
        }

        lock (roomsLock)
        {
            if (rooms.ContainsKey(code))
            {
                SendError(client, "That room code is already in use. Create a new room.");
                return;
            }

            RemoveClientLocked(client);
            Room room = new Room(code, settings, client);
            rooms[code] = room;
            client.RoomCode = code;
        }

        Send(client, new Dictionary<string, object> {
            { "type", "created" },
            { "id", client.Id }
        });
    }

    private void JoinRoom(Client client, Dictionary<string, object> message)
    {
        string code = GetString(message, "room", 8).ToUpperInvariant();
        Room room;
        Dictionary<string, object> response;
        lock (roomsLock)
        {
            if (!rooms.TryGetValue(code, out room))
            {
                SendError(client, "Room not found. Check the code and make sure the teacher still has the game open.");
                return;
            }
            if (room.Clients.Count >= MaxPlayers)
            {
                SendError(client, "This room is full.");
                return;
            }

            RemoveClientLocked(client);
            room.Clients[client.Id] = client;
            client.RoomCode = code;
            response = new Dictionary<string, object> {
                { "type", "joined" },
                { "id", client.Id },
                { "settings", room.Settings },
                { "players", new Dictionary<string, object>(room.Players) }
            };
        }

        Send(client, response);
    }

    private void UpdateProgress(Client client, Dictionary<string, object> message)
    {
        object dataObject;
        Dictionary<string, object> data;
        Room room;
        List<Client> recipients;
        lock (roomsLock)
        {
            if (String.IsNullOrEmpty(client.RoomCode) ||
                !rooms.TryGetValue(client.RoomCode, out room) ||
                !message.TryGetValue("data", out dataObject))
            {
                return;
            }
            data = dataObject as Dictionary<string, object>;
            if (data == null || GetString(data, "name", 20).Length == 0)
            {
                return;
            }
            object rawValue;
            double value;
            if (!data.TryGetValue("value", out rawValue) ||
                !Double.TryParse(Convert.ToString(rawValue, System.Globalization.CultureInfo.InvariantCulture),
                    System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out value) ||
                Double.IsNaN(value) || Double.IsInfinity(value) ||
                value < 0 || value > 1000000000000000000)
            {
                return;
            }
            data["name"] = GetString(data, "name", 20);
            data["value"] = value;
            room.Players[client.Id] = data;
            recipients = new List<Client>(room.Clients.Values);
        }

        Dictionary<string, object> update = new Dictionary<string, object> {
            { "type", "progress" },
            { "id", client.Id },
            { "data", data }
        };
        foreach (Client recipient in recipients)
        {
            if (recipient.Id != client.Id)
            {
                Send(recipient, update);
            }
        }
    }

    private void RemoveClient(Client client)
    {
        string oldRoom;
        List<Client> recipients = new List<Client>();
        bool hostLeft = false;
        lock (roomsLock)
        {
            oldRoom = client.RoomCode;
            if (String.IsNullOrEmpty(oldRoom) || !rooms.ContainsKey(oldRoom))
            {
                return;
            }

            Room room = rooms[oldRoom];
            hostLeft = room.HostId == client.Id;
            room.Clients.Remove(client.Id);
            room.Players.Remove(client.Id);
            client.RoomCode = null;
            if (hostLeft || room.Clients.Count == 0)
            {
                rooms.Remove(oldRoom);
                recipients = new List<Client>(room.Clients.Values);
            }
            else
            {
                recipients = new List<Client>(room.Clients.Values);
            }
        }

        if (hostLeft)
        {
            foreach (Client recipient in recipients)
            {
                Send(recipient, new Dictionary<string, object> { { "type", "room-closed" } });
                try { recipient.Socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Room ended", CancellationToken.None).Wait(1000); } catch { }
            }
        }
        else
        {
            Dictionary<string, object> update = new Dictionary<string, object> {
                { "type", "player-left" },
                { "id", client.Id }
            };
            foreach (Client recipient in recipients)
            {
                Send(recipient, update);
            }
        }
    }

    private void RemoveClientLocked(Client client)
    {
        if (!String.IsNullOrEmpty(client.RoomCode) && rooms.ContainsKey(client.RoomCode))
        {
            Room room = rooms[client.RoomCode];
            room.Clients.Remove(client.Id);
            room.Players.Remove(client.Id);
            if (room.HostId == client.Id || room.Clients.Count == 0)
            {
                rooms.Remove(room.Code);
            }
        }
        client.RoomCode = null;
    }

    private static string GetString(Dictionary<string, object> values, string key, int maxLength)
    {
        object value;
        if (!values.TryGetValue(key, out value) || value == null)
        {
            return "";
        }
        string text = Convert.ToString(value).Trim();
        return text.Length <= maxLength ? text : text.Substring(0, maxLength);
    }

    private static bool IsValidStat(string stat)
    {
        return stat == "reputation" || stat == "dataCollected" ||
            stat == "moneyCollected" || stat == "clicks";
    }

    private static void SendError(Client client, string error)
    {
        Send(client, new Dictionary<string, object> {
            { "type", "error" },
            { "message", error }
        });
    }

    private void ReportError(string message)
    {
        Action<string> handler = Error;
        if (handler != null)
        {
            handler(message);
        }
        else
        {
            Console.Error.WriteLine("Classroom host: " + message);
        }
    }

    private static void Send(Client client, Dictionary<string, object> message)
    {
        if (client.Socket.State != WebSocketState.Open)
        {
            return;
        }
        byte[] bytes = Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(message));
        lock (client.SendLock)
        {
            if (client.Socket.State == WebSocketState.Open)
            {
                try
                {
                    client.Socket.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, CancellationToken.None).Wait(3000);
                }
                catch (AggregateException) { }
                catch (WebSocketException) { }
            }
        }
    }

    private sealed class Client
    {
        public readonly string Id;
        public readonly WebSocket Socket;
        public readonly object SendLock = new object();
        public string RoomCode;

        public Client(string id, WebSocket socket)
        {
            Id = id;
            Socket = socket;
        }
    }

    private sealed class Room
    {
        public readonly string Code;
        public readonly string HostId;
        public readonly Dictionary<string, object> Settings;
        public readonly Dictionary<string, Client> Clients = new Dictionary<string, Client>();
        public readonly Dictionary<string, object> Players = new Dictionary<string, object>();

        public Room(string code, Dictionary<string, object> settings, Client host)
        {
            Code = code;
            HostId = host.Id;
            Settings = settings;
            Clients[host.Id] = host;
        }
    }
}
