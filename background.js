'use strict';

/**
 * タブ移動処理（特権ページ・スキップ機能付き）
 *
 * 【バグ修正】activeTab.index はFirefoxのグローバルタブインデックスであり、
 * ソート後の tabs[] 配列の添字（0, 1, 2...）とは別物。
 * そのため配列上の位置（findIndex）を使って nextIndex を計算する。
 */
async function shiftTab(direction) {
    try {
        const tabs = await browser.tabs.query({ currentWindow: true });
        if (tabs.length <= 1) return;

        tabs.sort((a, b) => a.index - b.index);

        // ✅ 修正: activeTab.index ではなく 配列上の添字（arrayPos）を使う
        const arrayPos = tabs.findIndex(t => t.active);
        if (arrayPos === -1) return;

        let nextPos = (arrayPos + direction + tabs.length) % tabs.length;

        // ── 特権ページスキップ ──
        for (let attempts = 0; attempts < tabs.length; attempts++) {
            const targetTab = tabs[nextPos];
            const url = targetTab.url || '';

            const isRestricted =
                url.startsWith('about:') ||
                url.startsWith('chrome:') ||
                url.startsWith('moz-extension:') ||
                url.includes('addons.mozilla.org');

            if (!isRestricted) {
                await browser.tabs.update(targetTab.id, { active: true });
                return;
            }

            nextPos = (nextPos + direction + tabs.length) % tabs.length;
        }
        // 全タブが特権ページの場合は何もしない
    } catch (e) {
        console.error('[FoxWalker] shiftTab error:', e);
    }
}

/**
 * メインリスナー
 */
browser.runtime.onMessage.addListener((message, sender) => {
    // sender.tab は content script からのメッセージにのみ存在する
    const tabId = sender.tab?.id;

    (async () => {
        try {
            switch (message.command) {
                case 'NEXT_TAB':
                    await shiftTab(1);
                    break;

                case 'PREV_TAB':
                    await shiftTab(-1);
                    break;

                case 'CLOSE_TAB': {
                    await browser.tabs.remove(tabId);
                    break;
                }

                case 'RELOAD_TAB': {
                    await browser.tabs.reload(tabId);
                    break;
                }

                case 'UNDO_CLOSE': {
                    // sessions.restore() は引数なしで最後に閉じたタブを復元
                    await browser.sessions.restore();
                    break;
                }

                case 'MUTE_TAB': {
                    const tab = await browser.tabs.get(tabId);
                    await browser.tabs.update(tabId, { muted: !tab.mutedInfo.muted });
                    break;
                }

                case 'DISCARD_TAB': {
                    // GG: アクティブ・ピン留め以外を全てDiscard（メモリ解放）
                    const tabsToDiscard = await browser.tabs.query({
                        currentWindow: true,
                        active: false,
                        pinned: false
                    });
                    const discardIds = tabsToDiscard.map(t => t.id);
                    if (discardIds.length > 0) {
                        await browser.tabs.discard(discardIds);
                    }
                    break;
                }

                case 'GO_FIRST_TAB': {
                    // 99: index最小（最も左）のタブへ移動
                    const allTabs = await browser.tabs.query({ currentWindow: true });
                    allTabs.sort((a, b) => a.index - b.index);
                    if (allTabs[0]) {
                        await browser.tabs.update(allTabs[0].id, { active: true });
                    }
                    break;
                }

                case 'CLEAN_UP': {
                    // 00: アクティブ・ピン留め以外を全て閉じる
                    const tabsToKill = await browser.tabs.query({
                        currentWindow: true,
                        active: false,
                        pinned: false
                    });
                    const targetIds = tabsToKill.map(t => t.id);
                    if (targetIds.length > 0) {
                        await browser.tabs.remove(targetIds);
                    }
                    break;
                }



                default:
                    console.warn('[FoxWalker] Unknown command:', message.command);
            }
        } catch (err) {
            console.error(`[FoxWalker] Error [${message.command}]:`, err);
        }
    })();

    return true; // 非同期応答チャネルを維持
});