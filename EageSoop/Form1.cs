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
        private const int MaxTabsPerClient = 5;
        private int userIndex = 1;
        private readonly HttpClient httpClient = new HttpClient();
        private readonly JavaScriptSerializer json = new JavaScriptSerializer();
        private readonly List<BrowserTabContext> browserContexts = new List<BrowserTabContext>();
        private readonly Random likeDelayRandom = new Random();
        private System.Windows.Forms.Timer heartbeatTimer;
        private System.Windows.Forms.Timer statusTimer;
        private System.Windows.Forms.Timer commandTimer;
        private string agentId;
        private string serverBaseUrl;
        private string agentName;
        private int heartbeatIntervalMs;
        private int statusReportIntervalMs;
        private readonly HashSet<string> processedCommandIds = new HashSet<string>();
        /// <summary>
        /// true 表示低内存模式（全部标签 Low + 静音）；false 表示正常模式（全部 Normal + 不静音）。与按钮互相切换。
        /// </summary>
        private bool backgroundMemorySaverEnabled;

        private System.Windows.Forms.Timer cacheSizeRefreshTimer;
        private int cacheSizeMeasureBusy;

        public Form1()
        {
            InitializeComponent();
            FormClosing += Form1_FormClosing;
            LoadAgentConfig();
            LoadProcessedCommands();
            InitializeAgentTimers();
            //InitializeAsync();
        }

        private void Form1_FormClosing(object sender, FormClosingEventArgs e)
        {
            try
            {
                if (cacheSizeRefreshTimer != null)
                {
                    cacheSizeRefreshTimer.Stop();
                    cacheSizeRefreshTimer.Tick -= CacheSizeRefreshTimer_Tick;
                    cacheSizeRefreshTimer.Dispose();
                    cacheSizeRefreshTimer = null;
                }
            }
            catch { }
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
            SyncPowerModeButtonText();

            cacheSizeRefreshTimer = new System.Windows.Forms.Timer();
            cacheSizeRefreshTimer.Interval = 8000;
            cacheSizeRefreshTimer.Tick += CacheSizeRefreshTimer_Tick;
            cacheSizeRefreshTimer.Start();
            _ = RefreshDiskCacheSizeDisplayAsync();

            _ = RegisterAgentAsync();
        }

        private async void CacheSizeRefreshTimer_Tick(object sender, EventArgs e)
        {
            await RefreshDiskCacheSizeDisplayAsync();
        }

        private async void BtnAddTab_Click(object sender, EventArgs e)
        {
            if (tabControl1.TabPages.Count >= MaxTabsPerClient)
            {
                MessageBox.Show($"最多只能打开 {MaxTabsPerClient} 个标签页。");
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

        private void BtnReduceMemory_Click(object sender, EventArgs e)
        {
            if (btnReduceMemory != null)
                btnReduceMemory.Enabled = false;
            try
            {
                backgroundMemorySaverEnabled = !backgroundMemorySaverEnabled;
                ApplyWebViewMemoryTargets();
                SyncPowerModeButtonText();

                if (backgroundMemorySaverEnabled)
                {
                    UpdateMemoryReleaseStatus(
                        DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
                        "已切换为低内存模式：不暂停视频；全部标签静音 + 低内存目标。"
                            + " Chromium 仍可能占用较多原生内存。"
                    );
                }
                else
                {
                    UpdateMemoryReleaseStatus(
                        DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
                        "已切换为正常模式：全部标签普通内存目标并已取消静音。"
                    );
                }
            }
            catch (Exception ex)
            {
                UpdateMemoryReleaseStatus(
                    DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
                    "失败：" + ex.Message,
                    isError: true);
            }
            finally
            {
                try
                {
                    if (!IsDisposed && IsHandleCreated && btnReduceMemory != null)
                        btnReduceMemory.Enabled = true;
                }
                catch { }
            }
        }

        /// <summary>
        /// 仅清除 HTTP/媒体磁盘缓存（DiskCache），不包含 Cookie、IndexedDB、LocalStorage、密码等。
        /// </summary>
        private async Task<string> ClearDiskCacheForContextAsync(BrowserTabContext ctx)
        {
            var wv = ctx.WebView;
            if (wv == null || wv.IsDisposed || wv.CoreWebView2 == null)
                return "webview_unavailable";
            var profile = wv.CoreWebView2.Profile;
            if (profile == null) return "no_profile";
            await profile
                .ClearBrowsingDataAsync(CoreWebView2BrowsingDataKinds.DiskCache)
                .ConfigureAwait(true);
            return null;
        }

        private async void BtnClearDiskCache_Click(object sender, EventArgs e)
        {
            if (btnClearDiskCache != null)
                btnClearDiskCache.Enabled = false;
            try
            {
                var ok = 0;
                var failed = new List<string>();
                foreach (var ctx in browserContexts)
                {
                    var wv = ctx.WebView;
                    if (wv == null || wv.IsDisposed || wv.CoreWebView2 == null) continue;
                    if (wv.CoreWebView2.Profile == null) continue;
                    try
                    {
                        var err = await ClearDiskCacheForContextAsync(ctx).ConfigureAwait(true);
                        if (err == null) ok++;
                        else failed.Add((ctx.Name ?? ctx.BrowserId ?? "?") + ": " + err);
                    }
                    catch (Exception ex)
                    {
                        failed.Add((ctx.Name ?? ctx.BrowserId ?? "?") + ": " + ex.Message);
                    }
                }

                await RefreshDiskCacheSizeDisplayAsync().ConfigureAwait(true);
                if (lblDiskCacheSize != null && IsHandleCreated && !IsDisposed)
                {
                    var suffix =
                        failed.Count > 0
                            ? $" | 清理失败 {failed.Count} 个标签（已成功 {ok} 个）"
                            : $" | 已清理 DiskCache（{ok} 个标签页，Cookie/登录未清除）";
                    lblDiskCacheSize.Text += suffix;
                    lblDiskCacheSize.ForeColor =
                        failed.Count > 0 ? Color.DarkOrange : lblDiskCacheSize.ForeColor;
                }
            }
            catch (Exception ex)
            {
                if (lblDiskCacheSize != null && IsHandleCreated && !IsDisposed)
                {
                    lblDiskCacheSize.ForeColor = Color.DarkRed;
                    lblDiskCacheSize.Text = "磁盘缓存：清理失败 " + ex.Message;
                }
            }
            finally
            {
                try
                {
                    if (!IsDisposed && IsHandleCreated && btnClearDiskCache != null)
                        btnClearDiskCache.Enabled = true;
                }
                catch { }
            }
        }

        /// <summary>
        /// 汇总各标签 Profile 下 Chromium 典型磁盘缓存目录体积（与 WebView2 DiskCache 清理范围接近；估算值）。
        /// 在后台线程遍历目录，默认约每 8 秒一次，对正常使用影响很小。
        /// </summary>
        private async Task RefreshDiskCacheSizeDisplayAsync()
        {
            if (System.Threading.Interlocked.CompareExchange(ref cacheSizeMeasureBusy, 1, 0) != 0)
                return;
            try
            {
                long total = await Task.Run(() =>
                {
                    long sum = 0;
                    var seenUserData = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                    foreach (var ctx in browserContexts)
                    {
                        try
                        {
                            var ud = ctx.UserDataFolderPath;
                            if (string.IsNullOrWhiteSpace(ud))
                            {
                                try
                                {
                                    ud = ctx.WebView?.CoreWebView2?.Profile?.ProfilePath;
                                }
                                catch { }
                            }
                            if (string.IsNullOrWhiteSpace(ud)) continue;
                            ud = Path.GetFullPath(ud);
                            if (!seenUserData.Add(ud)) continue;

                            string apiPath = null;
                            try
                            {
                                apiPath = ctx.WebView?.CoreWebView2?.Profile?.ProfilePath;
                            }
                            catch { }

                            sum += SumDiskCacheRelatedBytes(apiPath, ud);
                        }
                        catch { }
                    }
                    return sum;
                }).ConfigureAwait(true);

                if (IsDisposed || !IsHandleCreated || lblDiskCacheSize == null) return;
                var mb = total / (1024.0 * 1024.0);
                lblDiskCacheSize.ForeColor = Color.FromArgb(70, 70, 120);
                lblDiskCacheSize.Text =
                    $"磁盘缓存（估算，Cache / Code Cache / GPUCache）：{mb:F1} MB";
            }
            finally
            {
                System.Threading.Interlocked.Exchange(ref cacheSizeMeasureBusy, 0);
            }
        }

        /// <summary>
        /// WebView2 实际缓存多在「用户数据目录\EBWebView\Default」下，而非 Profile API 返回路径的直接子目录。
        /// </summary>
        private static long SumDiskCacheRelatedBytes(string profilePathFromApi, string userDataFolder)
        {
            var dirNames = new[]
            {
                "Cache",
                "Code Cache",
                "GPUCache",
            };
            var countedDirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            long sum = 0;

            foreach (var root in GatherCacheSearchRoots(profilePathFromApi, userDataFolder))
            {
                foreach (var dn in dirNames)
                {
                    try
                    {
                        var full = Path.Combine(root, dn);
                        if (!Directory.Exists(full)) continue;
                        full = Path.GetFullPath(full);
                        if (!countedDirs.Add(full)) continue;
                        sum += SumDirectoryBytes(full);
                    }
                    catch { }
                }
            }

            // 仍未找到时再浅层枚举 userDataFolder 下的子目录（适配未来目录结构变化）
            if (sum == 0 && !string.IsNullOrWhiteSpace(userDataFolder))
            {
                try
                {
                    var ud = Path.GetFullPath(userDataFolder);
                    if (Directory.Exists(ud))
                    {
                        foreach (var lev1 in Directory.EnumerateDirectories(ud))
                        {
                            foreach (var dn in dirNames)
                            {
                                try
                                {
                                    var full = Path.Combine(lev1, dn);
                                    if (!Directory.Exists(full)) continue;
                                    full = Path.GetFullPath(full);
                                    if (!countedDirs.Add(full)) continue;
                                    sum += SumDirectoryBytes(full);
                                }
                                catch { }
                            }
                            try
                            {
                                foreach (var lev2 in Directory.EnumerateDirectories(lev1))
                                {
                                    foreach (var dn in dirNames)
                                    {
                                        try
                                        {
                                            var full = Path.Combine(lev2, dn);
                                            if (!Directory.Exists(full)) continue;
                                            full = Path.GetFullPath(full);
                                            if (!countedDirs.Add(full)) continue;
                                            sum += SumDirectoryBytes(full);
                                        }
                                        catch { }
                                    }
                                }
                            }
                            catch { }
                        }
                    }
                }
                catch { }
            }

            return sum;
        }

        private static IEnumerable<string> GatherCacheSearchRoots(
            string profilePathFromApi,
            string userDataFolder)
        {
            var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            void Add(string p)
            {
                try
                {
                    if (string.IsNullOrWhiteSpace(p)) return;
                    p = Path.GetFullPath(p);
                    if (Directory.Exists(p))
                        set.Add(p);
                }
                catch { }
            }

            Add(profilePathFromApi);
            Add(userDataFolder);
            if (!string.IsNullOrWhiteSpace(userDataFolder))
            {
                Add(Path.Combine(userDataFolder, "Default"));
                Add(Path.Combine(userDataFolder, "EBWebView"));
                Add(Path.Combine(userDataFolder, "EBWebView", "Default"));
            }
            if (!string.IsNullOrWhiteSpace(profilePathFromApi))
            {
                Add(Path.Combine(profilePathFromApi, "Default"));
                Add(Path.Combine(profilePathFromApi, "EBWebView", "Default"));
            }

            return set;
        }

        private static long SumDirectoryBytes(string rootDir)
        {
            long sum = 0;
            try
            {
                foreach (var path in Directory.EnumerateFiles(rootDir, "*", SearchOption.AllDirectories))
                {
                    try
                    {
                        var fi = new FileInfo(path);
                        sum += fi.Length;
                    }
                    catch { }
                }
            }
            catch { }
            return sum;
        }

        private void UpdateMemoryReleaseStatus(string timeText, string messageText, bool isError = false)
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action(() => UpdateMemoryReleaseStatus(timeText, messageText, isError)));
                return;
            }
            if (lblLastMemoryReleaseTime != null)
                lblLastMemoryReleaseTime.Text = "上次切换：" + timeText;
            if (lblLastMemoryReleaseMessage != null)
            {
                lblLastMemoryReleaseMessage.Text = messageText ?? "";
                lblLastMemoryReleaseMessage.ForeColor =
                    isError ? Color.DarkRed : Color.FromArgb(96, 96, 96);
            }
        }

        private void TabControl1_SelectedIndexChanged(object sender, EventArgs e)
        {
            try
            {
                ApplyWebViewMemoryTargets();
            }
            catch
            {
                // 忽略
            }
        }

        /// <summary>
        /// 按钮文案：当前为低内存时显示「正常模式」（点击切回），否则显示「低内存模式」。
        /// </summary>
        private void SyncPowerModeButtonText()
        {
            if (btnReduceMemory == null) return;
            btnReduceMemory.Text = backgroundMemorySaverEnabled ? "正常模式" : "低内存模式";
        }

        private void ApplyWebViewMemoryTargets()
        {
            if (InvokeRequired)
            {
                BeginInvoke(new Action(ApplyWebViewMemoryTargets));
                return;
            }

            foreach (var ctx in browserContexts)
            {
                var wv = ctx.WebView;
                if (wv == null || wv.IsDisposed || wv.CoreWebView2 == null) continue;
                try
                {
                    var core = wv.CoreWebView2;
                    if (backgroundMemorySaverEnabled)
                    {
                        core.MemoryUsageTargetLevel =
                            CoreWebView2MemoryUsageTargetLevel.Low;
                        core.IsMuted = true;
                    }
                    else
                    {
                        core.MemoryUsageTargetLevel =
                            CoreWebView2MemoryUsageTargetLevel.Normal;
                        core.IsMuted = false;
                    }
                }
                catch
                {
                    // 个别 WebView 状态异常时跳过
                }
            }
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
                MessageBox.Show($"最多只能打开 {MaxTabsPerClient} 个标签页。");
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
                UserDataFolderPath = profilePath,
                CurrentUrl = url,
                LastNavigatedUrl = url,
                LastNavigatedAtUtc = DateTime.UtcNow
            });

            tabControl1.SelectedTab = tab;
            ApplyWebViewMemoryTargets();
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
            /// <summary>创建 WebView 环境时传入的用户数据目录（用于定位 EBWebView\Default 下的 Cache）。</summary>
            public string UserDataFolderPath { get; set; }
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

        private class RegisterApiResponse
        {
            public bool ok { get; set; }
            public string error { get; set; }
            public RegisterApiData data { get; set; }
        }

        private class RegisterApiData
        {
            public string agentId { get; set; }
        }

        private void ShowRegisterFailure(string message)
        {
            var text =
                "向管理后台注册客户端失败。\n\n"
                + (message ?? "")
                + "\n\n请检查 ServerBaseUrl、网络与管理端（如 Supabase Service Role、RLS）配置。";
            if (InvokeRequired)
            {
                BeginInvoke(
                    new Action(() =>
                        MessageBox.Show(
                            text,
                            "注册失败",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Error)));
            }
            else
            {
                MessageBox.Show(text, "注册失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        /// <returns>是否已成功向服务器注册</returns>
        private async Task<bool> RegisterAgentAsync()
        {
            try
            {
                var payload = new
                {
                    agentId = agentId,
                    name = string.IsNullOrWhiteSpace(agentName) ? Environment.MachineName : agentName,
                    host = Environment.MachineName,
                    capacity = MaxTabsPerClient
                };
                var fullUrl = serverBaseUrl + "/api/agents/register";
                var body = json.Serialize(payload);
                using (var content = new StringContent(body, Encoding.UTF8, "application/json"))
                {
                    var response = await httpClient.PostAsync(fullUrl, content);
                    var raw = await response.Content.ReadAsStringAsync();
                    RegisterApiResponse parsed = null;
                    try
                    {
                        parsed = json.Deserialize<RegisterApiResponse>(raw);
                    }
                    catch
                    {
                        // 保留 raw 展示
                    }

                    if (!response.IsSuccessStatusCode)
                    {
                        var detail =
                            parsed != null && !string.IsNullOrWhiteSpace(parsed.error)
                                ? parsed.error
                                : raw;
                        ShowRegisterFailure("HTTP " + (int)response.StatusCode + ": " + detail);
                        return false;
                    }

                    if (parsed == null || !parsed.ok)
                    {
                        ShowRegisterFailure(
                            parsed != null && !string.IsNullOrWhiteSpace(parsed.error)
                                ? parsed.error
                                : (raw ?? "未知错误"));
                        return false;
                    }

                    if (parsed.data != null && !string.IsNullOrWhiteSpace(parsed.data.agentId))
                        agentId = parsed.data.agentId.Trim();
                    return true;
                }
            }
            catch (Exception ex)
            {
                ShowRegisterFailure(ex.Message);
                return false;
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
            if (!await RegisterAgentAsync())
                return;
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
            /// <summary>set_power_mode：low | normal</summary>
            public string mode { get; set; }
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

                    await Task.Delay(NextLikeDelayMs(3000, 6000));
                    var likeResult = await TryAutoLikeAsync(ctx.WebView, 6, 25000);
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

                if (string.Equals(cmd.type, "clear_disk_cache", StringComparison.OrdinalIgnoreCase))
                {
                    string err;
                    try
                    {
                        err = await ClearDiskCacheForContextAsync(ctx).ConfigureAwait(true);
                    }
                    catch (Exception ex)
                    {
                        err = ex.Message;
                    }

                    await RefreshDiskCacheSizeDisplayAsync().ConfigureAwait(true);
                    if (err == null)
                    {
                        await ReportCommandResultAsync(cmd.id, true, "clear_disk_cache ok");
                    }
                    else
                    {
                        await ReportCommandResultAsync(cmd.id, false, "clear_disk_cache " + err);
                    }
                    processedCommandIds.Add(cmd.id);
                    SaveProcessedCommands();
                    return;
                }

                if (string.Equals(cmd.type, "set_power_mode", StringComparison.OrdinalIgnoreCase))
                {
                    var raw = (cmd.payload != null ? cmd.payload.mode : null) ?? "";
                    var wantLow = string.Equals(raw.Trim(), "low", StringComparison.OrdinalIgnoreCase);
                    backgroundMemorySaverEnabled = wantLow;
                    ApplyWebViewMemoryTargets();
                    SyncPowerModeButtonText();
                    if (backgroundMemorySaverEnabled)
                    {
                        UpdateMemoryReleaseStatus(
                            DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
                            "远程：低内存模式（全部标签静音 + 低内存目标）。"
                        );
                    }
                    else
                    {
                        UpdateMemoryReleaseStatus(
                            DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"),
                            "远程：正常模式。"
                        );
                    }
                    await ReportCommandResultAsync(
                        cmd.id,
                        true,
                        "set_power_mode " + (wantLow ? "low" : "normal")
                    );
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

        private int NextLikeDelayMs(int minMs, int maxMs)
        {
            if (maxMs <= minMs) return minMs;
            lock (likeDelayRandom)
            {
                // Next upper bound is exclusive, so +1 for inclusive max value.
                return likeDelayRandom.Next(minMs, maxMs + 1);
            }
        }

        private async Task<LikeScriptResult> ExecuteLikeScriptAsync(WebView2 webView)
        {
            try
            {
                // 多策略：先精确定位，再通用按钮。避免误点“分享/不喜欢”等。
                string likeScript = @"
(() => {
  const selectors = [
    // Newer YouTube layouts (segmented like/dislike)
    '#segmented-like-button button',
    'like-button-view-model button',
    'segmented-like-dislike-button-view-model button:first-of-type',
    // Classic watch metadata layout
    'ytd-watch-metadata #top-level-buttons-computed ytd-toggle-button-renderer:first-of-type button',
    'ytd-menu-renderer ytd-toggle-button-renderer:first-of-type button',
    // Generic localized aria labels
    'button[aria-label*=""like this video""]',
    'button[aria-label*=""Like this video""]',
    'button[aria-label*=""Me gusta""]',
    'button[aria-label*=""J’aime""]',
    'button[aria-label*=""Gefällt mir""]',
    'button[aria-label*=""赞""]',
    'button[aria-label*=""点赞""]',
    'button[aria-label*=""좋아요""]',
    'button[aria-label*=""いいね""]'
  ];

  const visible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };

  const clickButton = (el, selectorName) => {
    if (!visible(el) || el.disabled) return null;
    const pressed = (el.getAttribute('aria-pressed') || '').toLowerCase();
    if (pressed === 'true') {
      return { ok: true, selector: selectorName, reason: 'already_liked' };
    }
    try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}
    try { el.focus(); } catch (_) {}
    el.click();
    return { ok: true, selector: selectorName, reason: 'clicked' };
  };

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    const result = clickButton(el, sel);
    if (result) return JSON.stringify(result);
  }

  // Fallback: scan visible buttons and score candidates by semantics.
  const yesWords = ['like', 'thumb up', '赞', '点赞', '좋아요', 'いいね', 'me gusta', 'j’aime', 'gefällt mir'];
  const noWords = ['dislike', 'thumb down', '不喜欢', '싫어요', '低评价', 'down'];
  const buttons = Array.from(document.querySelectorAll('button'));

  for (const btn of buttons) {
    if (!visible(btn) || btn.disabled) continue;
    const raw = [
      btn.getAttribute('aria-label') || '',
      btn.getAttribute('title') || '',
      btn.innerText || '',
      btn.closest('[id]')?.id || '',
      btn.closest('[class]')?.className || ''
    ].join(' ').toLowerCase();

    if (!raw || raw.length < 2) continue;
    const isLike = yesWords.some(w => raw.includes(w));
    const isNotLike = noWords.some(w => raw.includes(w));
    if (!isLike || isNotLike) continue;

    const result = clickButton(btn, 'semantic_button_scan');
    if (result) return JSON.stringify(result);
  }

  // 页面未加载完成时，body 可能还在占位态
  if (!document.body || document.body.innerText.length < 20) {
    return JSON.stringify({ ok: false, reason: 'page_not_ready' });
  }

  const debugLabels = buttons
    .slice(0, 40)
    .map((b) => (b.getAttribute('aria-label') || b.getAttribute('title') || '').trim())
    .filter(Boolean)
    .slice(0, 8);

  return JSON.stringify({
    ok: false,
    reason: 'like_button_not_found',
    selector: debugLabels.join(' | ')
  });
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
