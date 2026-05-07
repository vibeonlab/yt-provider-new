using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using System.Text.Json;

internal sealed class AppConfig
{
    public string ServerBaseUrl { get; set; } = "http://localhost:3000";
    public string InternalApiToken { get; set; } = "";
    public int MinIntervalSeconds { get; set; } = 5;
    public int MaxIntervalSeconds { get; set; } = 9;
    public int RequestTimeoutSeconds { get; set; } = 15;
    public int LiveProbeTimeoutSeconds { get; set; } = 12;
    public string UserAgent { get; set; } =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AutoOnline/1.0";
}

internal sealed class StreamerDto
{
    public string id { get; set; } = "";
    public string name { get; set; } = "";
    public string liveUrl { get; set; } = "";
    public string status { get; set; } = "";
}

internal sealed class ApiResponse<T>
{
    public bool ok { get; set; }
    public T? data { get; set; }
    public string? error { get; set; }
}

internal enum LiveState
{
    Live,
    Offline,
    Unknown,
}

internal static class Program
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public static async Task Main()
    {
        var configPath = Path.Combine(AppContext.BaseDirectory, "appsettings.json");
        if (!File.Exists(configPath))
        {
            Console.WriteLine($"[{Now()}] 缺少配置文件: {configPath}");
            return;
        }

        var cfg = JsonSerializer.Deserialize<AppConfig>(File.ReadAllText(configPath), JsonOptions)
                  ?? new AppConfig();

        if (string.IsNullOrWhiteSpace(cfg.InternalApiToken))
        {
            Console.WriteLine($"[{Now()}] 配置项 InternalApiToken 为空，程序退出。");
            return;
        }

        if (cfg.MinIntervalSeconds < 1) cfg.MinIntervalSeconds = 1;
        if (cfg.MaxIntervalSeconds < cfg.MinIntervalSeconds)
            cfg.MaxIntervalSeconds = cfg.MinIntervalSeconds;

        using var appClient = BuildApiClient(cfg);
        using var probeClient = BuildProbeClient(cfg);
        using var cts = new CancellationTokenSource();
        Console.CancelKeyPress += (_, e) =>
        {
            e.Cancel = true;
            cts.Cancel();
            Console.WriteLine($"[{Now()}] 收到 Ctrl+C，准备退出...");
        };

        Console.WriteLine($"[{Now()}] AutoOnline 启动，API={cfg.ServerBaseUrl}");

        var random = new Random();
        var observed = new Dictionary<string, LiveState>(StringComparer.OrdinalIgnoreCase);
        var skippedInitialLive = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var firstCycle = true;

        while (!cts.IsCancellationRequested)
        {
            try
            {
                var streamers = await GetStreamersAsync(appClient, cts.Token);
                if (streamers.Count == 0)
                {
                    Console.WriteLine($"[{Now()}] 当前主播列表为空。");
                }
                else if (firstCycle)
                {
                    Console.WriteLine($"[{Now()}] 首轮基线检测: {streamers.Count} 个主播。");
                }

                foreach (var s in streamers)
                {
                    var state = await ProbeLiveStateAsync(probeClient, cfg, s.liveUrl, cts.Token);
                    var hasPrev = observed.TryGetValue(s.id, out var prev);

                    if (firstCycle)
                    {
                        observed[s.id] = state;
                        if (state == LiveState.Live)
                        {
                            skippedInitialLive.Add(s.id);
                            Console.WriteLine($"[{Now()}] [首轮忽略] {s.name} 当前正在直播，不触发自动上线。");
                        }
                        continue;
                    }

                    if (state == LiveState.Unknown)
                    {
                        Console.WriteLine($"[{Now()}] [探测未知] {s.name}，保持上次状态。");
                        continue;
                    }

                    if (!hasPrev)
                    {
                        observed[s.id] = state;
                        continue;
                    }

                    if (prev != LiveState.Live && state == LiveState.Live)
                    {
                        if (skippedInitialLive.Contains(s.id))
                        {
                            // 首轮已在播的主播，只有先离线过一次后再次开播才触发自动上线
                            if (prev == LiveState.Offline)
                            {
                                var ok = await CallOnlineAsync(appClient, s.id, cts.Token);
                                Console.WriteLine(
                                    $"[{Now()}] [自动上线] {s.name} => {(ok ? "成功" : "失败")}");
                            }
                            else
                            {
                                Console.WriteLine($"[{Now()}] [首轮保留] {s.name} 直播中，仍不触发上线。");
                            }
                        }
                        else
                        {
                            var ok = await CallOnlineAsync(appClient, s.id, cts.Token);
                            Console.WriteLine(
                                $"[{Now()}] [自动上线] {s.name} => {(ok ? "成功" : "失败")}");
                        }
                    }
                    else if (prev == LiveState.Live && state == LiveState.Offline)
                    {
                        var ok = await CallOfflineAsync(appClient, s.id, cts.Token);
                        Console.WriteLine($"[{Now()}] [自动下线] {s.name} => {(ok ? "成功" : "失败")}");
                    }

                    observed[s.id] = state;
                }

                firstCycle = false;
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[{Now()}] [循环异常] {ex.Message}");
            }

            var waitSeconds = random.Next(cfg.MinIntervalSeconds, cfg.MaxIntervalSeconds + 1);
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(waitSeconds), cts.Token);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        Console.WriteLine($"[{Now()}] AutoOnline 已退出。");
    }

    private static HttpClient BuildApiClient(AppConfig cfg)
    {
        var client = new HttpClient
        {
            BaseAddress = new Uri(cfg.ServerBaseUrl.TrimEnd('/') + "/"),
            Timeout = TimeSpan.FromSeconds(Math.Max(5, cfg.RequestTimeoutSeconds)),
        };
        client.DefaultRequestHeaders.Add("x-internal-token", cfg.InternalApiToken);
        client.DefaultRequestHeaders.Add("accept", "application/json");
        return client;
    }

    private static HttpClient BuildProbeClient(AppConfig cfg)
    {
        var client = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(Math.Max(5, cfg.LiveProbeTimeoutSeconds)),
        };
        client.DefaultRequestHeaders.Add("user-agent", cfg.UserAgent);
        client.DefaultRequestHeaders.Add("accept-language", "en-US,en;q=0.8");
        return client;
    }

    private static async Task<List<StreamerDto>> GetStreamersAsync(HttpClient client, CancellationToken ct)
    {
        using var resp = await client.GetAsync("api/internal/auto-online/streamers", ct);
        if (!resp.IsSuccessStatusCode)
        {
            var body = await resp.Content.ReadAsStringAsync();
            throw new Exception($"读取主播列表失败: {(int)resp.StatusCode} {body}");
        }

        var raw = await resp.Content.ReadAsStringAsync();
        var parsed = JsonSerializer.Deserialize<ApiResponse<List<StreamerDto>>>(raw, JsonOptions);
        if (parsed == null || !parsed.ok || parsed.data == null)
        {
            throw new Exception($"主播列表响应异常: {raw}");
        }
        return parsed.data;
    }

    private static async Task<bool> CallOnlineAsync(HttpClient client, string id, CancellationToken ct)
    {
        using var resp = await client.PostAsync($"api/internal/auto-online/streamers/{Uri.EscapeDataString(id)}/online", null, ct);
        if (!resp.IsSuccessStatusCode) return false;
        var raw = await resp.Content.ReadAsStringAsync();
        var parsed = JsonSerializer.Deserialize<ApiResponse<object>>(raw, JsonOptions);
        return parsed?.ok == true;
    }

    private static async Task<bool> CallOfflineAsync(HttpClient client, string id, CancellationToken ct)
    {
        using var resp = await client.PostAsync($"api/internal/auto-online/streamers/{Uri.EscapeDataString(id)}/offline", null, ct);
        if (!resp.IsSuccessStatusCode) return false;
        var raw = await resp.Content.ReadAsStringAsync();
        var parsed = JsonSerializer.Deserialize<ApiResponse<object>>(raw, JsonOptions);
        return parsed?.ok == true;
    }

    private static async Task<LiveState> ProbeLiveStateAsync(
        HttpClient probeClient,
        AppConfig cfg,
        string liveUrl,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(liveUrl)) return LiveState.Unknown;
        if (!Uri.TryCreate(liveUrl.Trim(), UriKind.Absolute, out var uri)) return LiveState.Unknown;

        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, uri);
            using var resp = await probeClient.SendAsync(req, ct);
            if (!resp.IsSuccessStatusCode) return LiveState.Unknown;

            var html = await resp.Content.ReadAsStringAsync();
            if (string.IsNullOrWhiteSpace(html)) return LiveState.Unknown;
            var lower = html.ToLowerInvariant();

            if (lower.Contains("\"islivenow\":true") ||
                lower.Contains("\"islive\":true") ||
                lower.Contains("hqdefault_live.jpg") ||
                lower.Contains("ytp-live-badge"))
            {
                return LiveState.Live;
            }

            if (lower.Contains("\"islivenow\":false") ||
                lower.Contains("premiere in") ||
                lower.Contains("streamed ") ||
                lower.Contains("this video is unavailable"))
            {
                return LiveState.Offline;
            }

            // 优先尝试 YouTube oembed，至少确认链接可解析
            var oembed = $"https://www.youtube.com/oembed?url={Uri.EscapeDataString(liveUrl)}&format=json";
            using var oembedResp = await probeClient.GetAsync(oembed, ct);
            if (oembedResp.IsSuccessStatusCode)
            {
                return LiveState.Offline;
            }

            return LiveState.Unknown;
        }
        catch (TaskCanceledException)
        {
            return LiveState.Unknown;
        }
        catch
        {
            return LiveState.Unknown;
        }
    }

    private static string Now() => DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
}
