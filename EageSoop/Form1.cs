using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Configuration;
using System.Data;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace EageSoop
{
    public partial class Form1 : Form
    {
        private const int MaxTabsPerClient = 10;
        private int userIndex = 1;
        private readonly HttpClient httpClient = new HttpClient();
        private readonly JavaScriptSerializer json = new JavaScriptSerializer();
        private readonly List<BrowserTabContext> browserContexts = new List<BrowserTabContext>();
        private System.Windows.Forms.Timer heartbeatTimer;
        private System.Windows.Forms.Timer statusTimer;
        private System.Windows.Forms.Timer commandTimer;
        private string agentId;
        private string serverBaseUrl;
        private string agentName;
        private int heartbeatIntervalMs;
        private int statusReportIntervalMs;
        private readonly HashSet<string> processedCommandIds = new HashSet<string>();

        public Form1()
        {
            InitializeComponent();
            LoadAgentConfig();
            LoadProcessedCommands();
            InitializeAgentTimers();
            //InitializeAsync();
        }

        private WebView2 webView;

        private async void Form1_Load(object sender, EventArgs e)
        {
            if (tabControl1.TabPages.Count < MaxTabsPerClient)
            {
                var toCreate = MaxTabsPerClient - tabControl1.TabPages.Count;
                for (int i = 0; i < toCreate; i++)
                {
                    await AddTabAsync("about:blank");
                }
            }
            txtAgentName.Text = agentName;
            UpdateWindowTitle();
            _ = RegisterAgentAsync();
        }

        private async void BtnAddTab_Click(object sender, EventArgs e)
        {
            if (tabControl1.TabPages.Count >= MaxTabsPerClient)
            {
                MessageBox.Show("最多只能打开 10 个标签页。");
                return;
            }

            string url = txtUrlInput.Text.Trim();
            if (string.IsNullOrEmpty(url))
            {
                MessageBox.Show("URL을 입력하세요.");
                return;
            }

            if (!url.StartsWith("http"))
            {
                url = "https://" + url; // https 자동 붙임
            }

            await AddTabAsync(url);
        }

        private void BtnRemoveTab_Click(object sender, EventArgs e)
        {
            if (tabControl1.TabPages.Count == 0) return;

            var tab = tabControl1.SelectedTab;

            // WebView2 Dispose
            foreach (Control ctrl in tab.Controls)
            {
                if (ctrl is Panel panel)
                {
                    foreach (Control inner in panel.Controls)
                    {
                        if (inner is WebView2 webView)
                        {
                            webView.Dispose(); // 🔥 Chromium 엔진 종료
                        }
                    }
                    panel.Controls.Clear(); // Panel 내 컨트롤 정리
                }
            }

            // 탭 제거
            var ctx = browserContexts.FirstOrDefault(c => c.Tab == tab);
            if (ctx != null) browserContexts.Remove(ctx);
            tab.Controls.Clear(); // 탭 안에 Panel 제거
            tabControl1.TabPages.Remove(tab); // 탭 제거
            tab.Dispose(); // 🔥 메모리 정리
        }

        private void BtnNavigate_Click(object sender, EventArgs e)
        {
            if (tabControl1.SelectedTab == null)
            {
                MessageBox.Show("탭이 없습니다.");
                return;
            }

            // 선택된 탭 내 WebView2 찾아서 이동
            var tab = tabControl1.SelectedTab;
            foreach (Control ctrl in tab.Controls)
            {
                if (ctrl is Panel panel)
                {
                    var webView = panel.Controls.OfType<WebView2>().FirstOrDefault();
                    var txtUrl = panel.Controls.OfType<TextBox>().FirstOrDefault();

                    if (webView != null && txtUrl != null)
                    {
                        string url = txtUrl.Text.Trim();
                        if (string.IsNullOrWhiteSpace(url))
                        {
                            url = txtUrlInput.Text.Trim();
                        }
                        if (!url.StartsWith("http"))
                            url = "https://" + url;

                        webView.CoreWebView2.Navigate(url);
                        txtUrl.Text = url; // 탭 내 URL도 업데이트
                        var found = browserContexts.FirstOrDefault(c => c.Tab == tab);
                        if (found != null)
                        {
                            found.CurrentUrl = url;
                            found.LastNavigatedUrl = url;
                            found.LastNavigatedAtUtc = DateTime.UtcNow;
                        }
                    }
                }
            }
        }

        private async Task AddTabAsync(string url)
        {
            if (tabControl1.TabPages.Count >= MaxTabsPerClient)
            {
                MessageBox.Show("最多只能打开 10 个标签页。");
                return;
            }

            string userId = $"User{userIndex++}";
            string profilePath = Path.Combine(Application.StartupPath, "Profiles", userId);

            var tab = new TabPage(userId);
            tabControl1.TabPages.Add(tab);

            var panel = new Panel { Dock = DockStyle.Fill };
            tab.Controls.Add(panel);

            var txtUrl = new TextBox
            {
                Dock = DockStyle.Top,
                ReadOnly = false,
                Height = 25,
                BackColor = System.Drawing.Color.White,
                BorderStyle = BorderStyle.FixedSingle
            };

            var webView = new WebView2 { Dock = DockStyle.Fill };
            panel.Controls.Add(webView);
            panel.Controls.Add(txtUrl);

            var env = await CoreWebView2Environment.CreateAsync(null, profilePath);
            await webView.EnsureCoreWebView2Async(env);

            webView.CoreWebView2.NavigationCompleted += async (s, ev) =>
            {
            
                try
                {
                    var ctx = browserContexts.FirstOrDefault(c => c.Tab == tab);
                    if (ctx != null)
                    {
                        ctx.CurrentUrl = webView.Source?.ToString() ?? url;
                    }
                    string script = "document.getElementById('play')?.click();";
                    await webView.ExecuteScriptAsync(script);
                }
                catch { }
            };

            webView.CoreWebView2.Navigate(url);
            txtUrl.Text = url;
            txtUrl.KeyDown += (s, e) =>
            {
                if (e.KeyCode != Keys.Enter) return;
                e.SuppressKeyPress = true;
                var inputUrl = txtUrl.Text.Trim();
                if (string.IsNullOrWhiteSpace(inputUrl)) return;
                if (!inputUrl.StartsWith("http"))
                    inputUrl = "https://" + inputUrl;
                webView.CoreWebView2.Navigate(inputUrl);
                txtUrl.Text = inputUrl;
                var found = browserContexts.FirstOrDefault(c => c.Tab == tab);
                if (found != null)
                {
                    found.CurrentUrl = inputUrl;
                    found.LastNavigatedUrl = inputUrl;
                    found.LastNavigatedAtUtc = DateTime.UtcNow;
                }
            };
            browserContexts.Add(new BrowserTabContext
            {
                BrowserId = userId,
                Name = userId,
                WebView = webView,
                Tab = tab,
                CurrentUrl = url,
                LastNavigatedUrl = url,
                LastNavigatedAtUtc = DateTime.UtcNow
            });

            tabControl1.SelectedTab = tab;
        }

        private void btnRemoveTab_Click_1(object sender, EventArgs e)
        {

        }

        //private async void btnAddTab_Click(object sender, EventArgs e)
        //{
        //    string userId = $"User{userIndex++}";
        //    string profilePath = Path.Combine(Application.StartupPath, "Profiles", userId);

        //    var tab = new TabPage(userId);
        //    tabControl1.TabPages.Add(tab);

        //    // 컨테이너 패널 (탭 내 레이아웃)
        //    var panel = new Panel { Dock = DockStyle.Fill };
        //    tab.Controls.Add(panel);

        //    // URL 표시줄
        //    var txtUrl = new TextBox
        //    {
        //        Dock = DockStyle.Top,
        //        ReadOnly = true,
        //        Height = 25,
        //        BackColor = System.Drawing.Color.White,
        //        BorderStyle = BorderStyle.FixedSingle
        //    };

        //    // WebView2
        //    var webView = new WebView2
        //    {
        //        Dock = DockStyle.Fill
        //    };

        //    panel.Controls.Add(webView);
        //    panel.Controls.Add(txtUrl);

        //    var env = await CoreWebView2Environment.CreateAsync(null, profilePath);
        //    await webView.EnsureCoreWebView2Async(env);

        //    // 자동 URL 표시 및 버튼 클릭
        //    webView.CoreWebView2.NavigationCompleted += async (s, ev) =>
        //    {

        //        // 자동 재생 시도
        //        try
        //        {
        //            string script = "document.getElementById('play')?.click();";
        //            await webView.ExecuteScriptAsync(script);
        //        }
        //        catch { }
        //    };

        //    webView.CoreWebView2.Navigate("https://play.sooplive.co.kr/9ambler/285198290");

        //    txtUrl.Text = "https://play.sooplive.co.kr/9ambler/285198290"; // 탭 내 주소창에 현재 주소 표시
        //}

        //private void btnRemoveTab_Click(object sender, EventArgs e)
        //{
        //    if (tabControl1.TabPages.Count == 0) return;

        //    var tab = tabControl1.SelectedTab;

        //    // WebView2 Dispose
        //    foreach (Control ctrl in tab.Controls)
        //    {
        //        if (ctrl is Panel panel)
        //        {
        //            foreach (Control inner in panel.Controls)
        //            {
        //                if (inner is WebView2 webView)
        //                {
        //                    webView.Dispose(); // 🔥 Chromium 엔진 종료
        //                }
        //            }
        //            panel.Controls.Clear(); // Panel 내 컨트롤 정리
        //        }
        //    }

        //    // 탭 제거
        //    tab.Controls.Clear(); // 탭 안에 Panel 제거
        //    tabControl1.TabPages.Remove(tab); // 탭 제거
        //    tab.Dispose(); // 🔥 메모리 정리
        //}

        //private async void InitializeAsync()
        //{
        //    webView = new WebView2();
        //    webView.Dock = DockStyle.Fill;
        //    this.Controls.Add(webView);

        //    // WebView2 환경 초기화
        //    await webView.EnsureCoreWebView2Async();

        //    // 접속할 스트리밍 사이트
        //    webView.CoreWebView2.Navigate("https://play.sooplive.co.kr/9ambler/285198290");
        //}

        private class BrowserTabContext
        {
            public string BrowserId { get; set; }
            public string Name { get; set; }
            public WebView2 WebView { get; set; }
            public TabPage Tab { get; set; }
            public string CurrentUrl { get; set; }
            public string LastNavigatedUrl { get; set; }
            public DateTime LastNavigatedAtUtc { get; set; }
        }

        private TextBox FindTabUrlTextBox(BrowserTabContext ctx)
        {
            if (ctx == null || ctx.Tab == null) return null;
            foreach (Control ctrl in ctx.Tab.Controls)
            {
                if (ctrl is Panel panel)
                {
                    return panel.Controls.OfType<TextBox>().FirstOrDefault();
                }
            }
            return null;
        }

        private void LoadAgentConfig()
        {
            serverBaseUrl = (ConfigurationManager.AppSettings["ServerBaseUrl"] ?? "http://localhost:3000").TrimEnd('/');
            var appConfigName = ConfigurationManager.AppSettings["AgentName"];
            agentName = LoadOrCreateAgentName(appConfigName);
            heartbeatIntervalMs = ParseInt(ConfigurationManager.AppSettings["HeartbeatIntervalMs"], 5000);
            statusReportIntervalMs = ParseInt(ConfigurationManager.AppSettings["StatusReportIntervalMs"], 3000);
            agentId = LoadOrCreateAgentId();
        }

        private string AgentNameFilePath()
        {
            return Path.Combine(Application.StartupPath, "agent-name.txt");
        }

        private string LoadOrCreateAgentName(string appConfigName)
        {
            var fp = AgentNameFilePath();
            try
            {
                if (File.Exists(fp))
                {
                    var existing = File.ReadAllText(fp).Trim();
                    if (!string.IsNullOrWhiteSpace(existing)) return existing;
                }
            }
            catch { }

            var seed = string.IsNullOrWhiteSpace(appConfigName) ? Environment.MachineName : appConfigName.Trim();
            SaveAgentName(seed);
            return seed;
        }

        private void SaveAgentName(string nextName)
        {
            var normalized = (nextName ?? "").Trim();
            if (string.IsNullOrWhiteSpace(normalized)) return;
            agentName = normalized;
            try
            {
                File.WriteAllText(AgentNameFilePath(), normalized);
            }
            catch { }
        }

        private void UpdateWindowTitle()
        {
            this.Text = "Soop Web - " + (string.IsNullOrWhiteSpace(agentName) ? "Unknown" : agentName);
        }

        private int ParseInt(string raw, int fallback)
        {
            int n;
            return int.TryParse(raw, out n) && n > 0 ? n : fallback;
        }

        private string LoadOrCreateAgentId()
        {
            var idFile = Path.Combine(Application.StartupPath, "agent.id");
            if (File.Exists(idFile))
            {
                var existing = File.ReadAllText(idFile).Trim();
                if (!string.IsNullOrEmpty(existing)) return existing;
            }

            var created = "agent_" + Guid.NewGuid().ToString("N");
            File.WriteAllText(idFile, created);
            return created;
        }

        private void InitializeAgentTimers()
        {
            heartbeatTimer = new System.Windows.Forms.Timer();
            heartbeatTimer.Interval = heartbeatIntervalMs;
            heartbeatTimer.Tick += async (s, e) => await SendHeartbeatAsync();
            heartbeatTimer.Start();

            statusTimer = new System.Windows.Forms.Timer();
            statusTimer.Interval = statusReportIntervalMs;
            statusTimer.Tick += async (s, e) => await ReportStatusAsync();
            statusTimer.Start();

            commandTimer = new System.Windows.Forms.Timer();
            commandTimer.Interval = 2000;
            commandTimer.Tick += async (s, e) => await PollCommandsAsync();
            commandTimer.Start();
        }

        private string ProcessedCommandsFilePath()
        {
            return Path.Combine(Application.StartupPath, "processed-commands.json");
        }

        private void LoadProcessedCommands()
        {
            try
            {
                var fp = ProcessedCommandsFilePath();
                if (!File.Exists(fp)) return;
                var raw = File.ReadAllText(fp);
                var ids = json.Deserialize<List<string>>(raw) ?? new List<string>();
                foreach (var id in ids) processedCommandIds.Add(id);
            }
            catch { }
        }

        private void SaveProcessedCommands()
        {
            try
            {
                var fp = ProcessedCommandsFilePath();
                var list = processedCommandIds.Take(2000).ToList();
                File.WriteAllText(fp, json.Serialize(list));
            }
            catch { }
        }

        private async Task RegisterAgentAsync()
        {
            try
            {
                var payload = new
                {
                    agentId = agentId,
                    name = string.IsNullOrWhiteSpace(agentName) ? Environment.MachineName : agentName,
                    host = Environment.MachineName,
                    capacity = 10
                };
                await PostJsonAsync("/api/agents/register", payload);
            }
            catch
            {
                // 忽略临时网络失败，后续心跳会继续尝试
            }
        }

        private async void BtnSetAgentName_Click(object sender, EventArgs e)
        {
            var nextName = (txtAgentName.Text ?? "").Trim();
            if (string.IsNullOrWhiteSpace(nextName))
            {
                MessageBox.Show("程序名称不能为空。");
                return;
            }

            SaveAgentName(nextName);
            UpdateWindowTitle();
            await RegisterAgentAsync();
            await ReportStatusAsync();
            MessageBox.Show("程序名称已更新。");
        }

        private async Task SendHeartbeatAsync()
        {
            if (string.IsNullOrWhiteSpace(agentId)) return;
            try
            {
                await PostJsonAsync("/api/agents/heartbeat", new { agentId = agentId });
            }
            catch
            {
                // 忽略临时网络失败
            }
        }

        private async Task ReportStatusAsync()
        {
            if (string.IsNullOrWhiteSpace(agentId)) return;
            try
            {
                var browsers = browserContexts.Select(ctx =>
                {
                    var url = ctx.WebView != null && ctx.WebView.Source != null
                        ? ctx.WebView.Source.ToString()
                        : (ctx.CurrentUrl ?? "");
                    return new
                    {
                        browserId = ctx.BrowserId,
                        name = ctx.Name,
                        wsUrl = "local-webview://" + ctx.BrowserId,
                        connected = ctx.WebView != null && !ctx.WebView.IsDisposed,
                        tabsCount = 1,
                        activeUrl = url,
                        tabs = new[] { string.IsNullOrWhiteSpace(url) ? "about:blank" : url }
                    };
                }).ToArray();

                await PostJsonAsync("/api/agents/status", new
                {
                    agentId = agentId,
                    browsers = browsers
                });
            }
            catch
            {
                // 忽略临时网络失败
            }
        }

        private class CommandPollResponse
        {
            public bool ok { get; set; }
            public List<AgentCommand> data { get; set; }
        }

        private class AgentCommand
        {
            public string id { get; set; }
            public string type { get; set; }
            public string browserId { get; set; }
            public CommandPayload payload { get; set; }
        }

        private class CommandPayload
        {
            public string url { get; set; }
        }

        private class LikeScriptResult
        {
            public bool ok { get; set; }
            public string reason { get; set; }
            public string selector { get; set; }
        }

        private async Task PollCommandsAsync()
        {
            if (string.IsNullOrWhiteSpace(agentId)) return;
            try
            {
                var resp = await GetJsonAsync<CommandPollResponse>("/api/agents/commands?agentId=" + Uri.EscapeDataString(agentId));
                if (resp == null || resp.data == null || resp.data.Count == 0) return;

                foreach (var cmd in resp.data)
                {
                    await ExecuteCommandAsync(cmd);
                }
            }
            catch
            {
                // 忽略临时网络失败
            }
        }

        private async Task ExecuteCommandAsync(AgentCommand cmd)
        {
            try
            {
                if (processedCommandIds.Contains(cmd.id))
                {
                    await ReportCommandResultAsync(cmd.id, true, "duplicate ignored");
                    return;
                }

                var ctx = browserContexts.FirstOrDefault(c => c.BrowserId == cmd.browserId);
                if (ctx == null || ctx.WebView == null || ctx.WebView.IsDisposed || ctx.WebView.CoreWebView2 == null)
                {
                    await ReportCommandResultAsync(cmd.id, false, "browser not found");
                    return;
                }

                var targetUrl = (cmd.payload != null && !string.IsNullOrWhiteSpace(cmd.payload.url))
                    ? cmd.payload.url
                    : "https://www.youtube.com/";

                if (string.Equals(cmd.type, "open_stream", StringComparison.OrdinalIgnoreCase))
                {
                    var normalizeCurrent = (ctx.CurrentUrl ?? "").Trim().TrimEnd('/');
                    var normalizeTarget = targetUrl.Trim().TrimEnd('/');
                    var repeatedInShortWindow =
                        string.Equals(normalizeCurrent, normalizeTarget, StringComparison.OrdinalIgnoreCase) &&
                        (DateTime.UtcNow - ctx.LastNavigatedAtUtc).TotalSeconds < 25;
                    if (repeatedInShortWindow)
                    {
                        await ReportCommandResultAsync(cmd.id, true, "open_stream already_on_target");
                        processedCommandIds.Add(cmd.id);
                        SaveProcessedCommands();
                        return;
                    }

                    ctx.WebView.CoreWebView2.Navigate(targetUrl);
                    ctx.CurrentUrl = targetUrl;
                    ctx.LastNavigatedUrl = targetUrl;
                    ctx.LastNavigatedAtUtc = DateTime.UtcNow;
                    var urlBox = FindTabUrlTextBox(ctx);
                    if (urlBox != null) urlBox.Text = targetUrl;

                    var likeResult = await TryAutoLikeAsync(ctx.WebView, 3, 12000);
                    if (!likeResult.ok)
                    {
                        await ReportCommandResultAsync(
                            cmd.id,
                            false,
                            "open_stream like_failed:" + (likeResult.reason ?? "unknown")
                        );
                        return;
                    }

                    await ReportCommandResultAsync(
                        cmd.id,
                        true,
                        "open_stream done selector:" + (likeResult.selector ?? "unknown")
                    );
                    processedCommandIds.Add(cmd.id);
                    SaveProcessedCommands();
                    return;
                }

                if (string.Equals(cmd.type, "go_home", StringComparison.OrdinalIgnoreCase))
                {
                    var homeUrl = "https://www.youtube.com/";
                    var normalizeCurrent = (ctx.CurrentUrl ?? "").Trim().TrimEnd('/');
                    var repeatedInShortWindow =
                        string.Equals(normalizeCurrent, "https://www.youtube.com", StringComparison.OrdinalIgnoreCase) &&
                        (DateTime.UtcNow - ctx.LastNavigatedAtUtc).TotalSeconds < 25;
                    if (repeatedInShortWindow)
                    {
                        await ReportCommandResultAsync(cmd.id, true, "go_home already_on_target");
                        processedCommandIds.Add(cmd.id);
                        SaveProcessedCommands();
                        return;
                    }

                    ctx.WebView.CoreWebView2.Navigate(homeUrl);
                    ctx.CurrentUrl = homeUrl;
                    ctx.LastNavigatedUrl = homeUrl;
                    ctx.LastNavigatedAtUtc = DateTime.UtcNow;
                    var urlBox = FindTabUrlTextBox(ctx);
                    if (urlBox != null) urlBox.Text = homeUrl;
                    await ReportCommandResultAsync(cmd.id, true, "go_home done");
                    processedCommandIds.Add(cmd.id);
                    SaveProcessedCommands();
                    return;
                }

                await ReportCommandResultAsync(cmd.id, false, "unknown command type");
            }
            catch (Exception ex)
            {
                await ReportCommandResultAsync(cmd.id, false, ex.Message);
            }
        }

        private async Task ReportCommandResultAsync(string commandId, bool success, string message)
        {
            try
            {
                await PostJsonAsync("/api/agents/command-result", new
                {
                    commandId = commandId,
                    success = success,
                    message = message
                });
            }
            catch
            {
                // 忽略回执失败，下一次状态会上报
            }
        }

        private async Task<LikeScriptResult> TryAutoLikeAsync(
            WebView2 webView,
            int maxAttempts,
            int timeoutMs
        )
        {
            if (webView == null || webView.IsDisposed || webView.CoreWebView2 == null)
            {
                return new LikeScriptResult
                {
                    ok = false,
                    reason = "webview_unavailable"
                };
            }

            var started = DateTime.UtcNow;
            var waitStepMs = 1200;
            for (int attempt = 1; attempt <= maxAttempts; attempt++)
            {
                var elapsed = (DateTime.UtcNow - started).TotalMilliseconds;
                if (elapsed > timeoutMs)
                {
                    return new LikeScriptResult
                    {
                        ok = false,
                        reason = "like_timeout"
                    };
                }

                // 等页面结构稳定后再尝试
                await Task.Delay(waitStepMs);

                var result = await ExecuteLikeScriptAsync(webView);
                if (result.ok) return result;

                // 页面没准备好时继续重试；其他失败也重试但会在最后回传具体原因
                if (attempt == maxAttempts)
                {
                    return new LikeScriptResult
                    {
                        ok = false,
                        reason = string.IsNullOrWhiteSpace(result.reason)
                            ? "like_unknown_failure"
                            : result.reason
                    };
                }
            }

            return new LikeScriptResult
            {
                ok = false,
                reason = "like_unknown_failure"
            };
        }

        private async Task<LikeScriptResult> ExecuteLikeScriptAsync(WebView2 webView)
        {
            try
            {
                // 多策略：先精确定位，再通用按钮。避免误点“分享/不喜欢”等。
                string likeScript = @"
(() => {
  const selectors = [
    'ytd-watch-metadata #top-level-buttons-computed ytd-toggle-button-renderer:first-of-type button',
    'button[aria-label*=""like this video""]',
    'button[aria-label*=""Like this video""]',
    'button[aria-label*=""赞""]',
    'button[aria-label*=""좋아요""]',
    'ytd-menu-renderer ytd-toggle-button-renderer:first-of-type button'
  ];

  const visible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (visible(el)) {
      el.click();
      return JSON.stringify({ ok: true, selector: sel, reason: 'clicked' });
    }
  }

  // 页面未加载完成时，body 可能还在占位态
  if (!document.body || document.body.innerText.length < 20) {
    return JSON.stringify({ ok: false, reason: 'page_not_ready' });
  }

  return JSON.stringify({ ok: false, reason: 'like_button_not_found' });
})();";

                var raw = await webView.ExecuteScriptAsync(likeScript);
                var normalized = NormalizeWebViewJson(raw);
                if (string.IsNullOrWhiteSpace(normalized))
                {
                    return new LikeScriptResult { ok = false, reason = "script_empty_result" };
                }

                var parsed = json.Deserialize<LikeScriptResult>(normalized);
                if (parsed == null)
                {
                    return new LikeScriptResult { ok = false, reason = "script_parse_failed" };
                }

                return parsed;
            }
            catch (Exception ex)
            {
                return new LikeScriptResult
                {
                    ok = false,
                    reason = "script_exception:" + ex.GetType().Name
                };
            }
        }

        private string NormalizeWebViewJson(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return "";
            string s = raw.Trim();

            // WebView2 ExecuteScriptAsync returns JSON encoded string (quoted).
            // Example: "\"{\\\"ok\\\":true}\""
            if (s.StartsWith("\"") && s.EndsWith("\"") && s.Length >= 2)
            {
                s = s.Substring(1, s.Length - 2);
            }
            s = s.Replace("\\\"", "\"").Replace("\\\\", "\\");
            return s;
        }

        private async Task PostJsonAsync(string path, object payload)
        {
            var fullUrl = serverBaseUrl + path;
            var body = json.Serialize(payload);
            using (var content = new StringContent(body, Encoding.UTF8, "application/json"))
            {
                var response = await httpClient.PostAsync(fullUrl, content);
                response.EnsureSuccessStatusCode();
            }
        }

        private async Task<T> GetJsonAsync<T>(string path) where T : class
        {
            var fullUrl = serverBaseUrl + path;
            var raw = await httpClient.GetStringAsync(fullUrl);
            return json.Deserialize<T>(raw);
        }
    }
}
