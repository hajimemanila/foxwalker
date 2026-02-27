"use strict";
(() => {
  // src/background.ts
  async function shiftTab(direction) {
    try {
      const tabs = await browser.tabs.query({ currentWindow: true });
      if (tabs.length <= 1) return;
      tabs.sort((a, b) => a.index - b.index);
      const arrayPos = tabs.findIndex((t) => t.active);
      if (arrayPos === -1) return;
      let nextPos = (arrayPos + direction + tabs.length) % tabs.length;
      for (let attempts = 0; attempts < tabs.length; attempts++) {
        const targetTab = tabs[nextPos];
        const url = targetTab.url ?? "";
        const isRestricted = url.startsWith("about:") || url.startsWith("chrome:") || url.startsWith("moz-extension:") || url.includes("addons.mozilla.org");
        if (!isRestricted) {
          await browser.tabs.update(targetTab.id, { active: true });
          return;
        }
        nextPos = (nextPos + direction + tabs.length) % tabs.length;
      }
    } catch (e) {
      console.error("[FoxWalker] shiftTab error:", e);
    }
  }
  browser.runtime.onMessage.addListener((message, sender) => {
    const tabId = sender.tab?.id;
    (async () => {
      try {
        switch (message.command) {
          case "NEXT_TAB":
            await shiftTab(1);
            break;
          case "PREV_TAB":
            await shiftTab(-1);
            break;
          case "CLOSE_TAB": {
            if (tabId !== void 0) await browser.tabs.remove(tabId);
            break;
          }
          case "RELOAD_TAB": {
            if (tabId !== void 0) await browser.tabs.reload(tabId);
            break;
          }
          case "UNDO_CLOSE": {
            await browser.sessions.restore();
            break;
          }
          case "MUTE_TAB": {
            if (tabId === void 0) break;
            const tab = await browser.tabs.get(tabId);
            await browser.tabs.update(tabId, { muted: !tab.mutedInfo?.muted });
            break;
          }
          case "DISCARD_TAB": {
            const tabsToDiscard = await browser.tabs.query({
              currentWindow: true,
              active: false,
              pinned: false
            });
            const discardIds = tabsToDiscard.map((t) => t.id).filter((id) => id !== void 0);
            if (discardIds.length > 0) {
              await browser.tabs.discard(discardIds);
            }
            break;
          }
          case "GO_FIRST_TAB": {
            const allTabs = await browser.tabs.query({ currentWindow: true });
            allTabs.sort((a, b) => a.index - b.index);
            if (allTabs[0]?.id !== void 0) {
              await browser.tabs.update(allTabs[0].id, { active: true });
            }
            break;
          }
          case "DUPLICATE_TAB": {
            if (tabId !== void 0) await browser.tabs.duplicate(tabId);
            break;
          }
          case "CLEAN_UP": {
            const tabsToKill = await browser.tabs.query({
              currentWindow: true,
              active: false,
              pinned: false
            });
            const targetIds = tabsToKill.map((t) => t.id).filter((id) => id !== void 0);
            if (targetIds.length > 0) {
              await browser.tabs.remove(targetIds);
            }
            break;
          }
          default:
            console.warn("[FoxWalker] Unknown command:", message.command);
        }
      } catch (err) {
        console.error(`[FoxWalker] Error [${message.command}]:`, err);
      }
    })();
    return true;
  });
})();
