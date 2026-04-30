export type BrowserConfig = {
  id: string;
  name: string;
  wsUrl: string;
};

export type BrowserStatus = BrowserConfig & {
  connected: boolean;
  tabsCount: number; // 0-10
  activeUrl: string;
};

const initialUrls = [
  "https://www.youtube.com/",
  "https://studio.youtube.com/",
  "https://accounts.google.com/",
  "https://www.bilibili.com/",
  "https://example.com/live",
  "https://example.com/dashboard",
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

// Module-level state is fine for dev/UI prototyping.
let browsers: (BrowserStatus & { wsUrl: string })[] = [
  {
    id: "browser_1",
    name: "Browser-01",
    wsUrl: "ws://127.0.0.1:9001",
    connected: true,
    tabsCount: 6,
    activeUrl: initialUrls[0],
  },
  {
    id: "browser_2",
    name: "Browser-02",
    wsUrl: "ws://127.0.0.1:9002",
    connected: true,
    tabsCount: 3,
    activeUrl: initialUrls[2],
  },
];

export function listBrowserConfigs() {
  return browsers.map((b) => ({ id: b.id, name: b.name, wsUrl: b.wsUrl }));
}

export function addBrowser(config: { name: string; wsUrl: string }) {
  const next: BrowserStatus = {
    id: makeId("browser"),
    name: config.name.trim(),
    wsUrl: config.wsUrl.trim(),
    connected: false,
    tabsCount: 0,
    activeUrl: "",
  };
  browsers.push(next);
  return next;
}

export function deleteBrowser(id: string) {
  browsers = browsers.filter((b) => b.id !== id);
}

export function listBrowserStatuses(): BrowserStatus[] {
  // Simulate connection/tab activity changes.
  browsers = browsers.map((b) => {
    const willDisconnect = b.connected && Math.random() < 0.05;
    const willConnect = !b.connected && Math.random() < 0.08;
    const connected = willDisconnect ? false : willConnect ? true : b.connected;

    if (!connected) {
      return { ...b, connected: false, tabsCount: 0, activeUrl: "" };
    }

    const tabsCount = clamp(Math.floor(Math.random() * 11), 1, 10);
    const activeUrl = initialUrls[Math.floor(Math.random() * initialUrls.length)];
    return { ...b, connected: true, tabsCount, activeUrl };
  });

  return browsers.map((b) => ({ ...b }));
}

