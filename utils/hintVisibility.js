"use strict";
/**
 * 提示（推荐走法）显示判定
 *
 * 几个场景读不同的开关，此前散落在 ChessBoard / AnalysisPanel 两处内联判断：
 * - 自主探究（自由走子 freeMoveMode）：用独立的 settings.exploreHints，
 *   不受 AI 陪练的 AI 教练开关(settings.showHints)影响；
 * - 空白棋盘打谱（blankBoardMode）：用独立的 settings.blankBoardHints，同理；
 * - 习题解答页（scope=puzzle）：用独立的 settings.puzzleHints，默认关闭 ——
 *   做习题先自己思考，需要提示时在页面顶栏手动打开；
 * - 手动推演（exploration.mode === 'manual'）：视为「已开启 AI 教练」，
 *   用派生标志而非改写用户持久化的 showHints，退出推演后原选择不受影响；
 * - 其余场景（AI 陪练对弈、复盘等）：跟随 AI 教练开关。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isHintsActive = isHintsActive;
/** 判定推荐走法提示是否应当显示 */
function isHintsActive(params) {
    const { showHints, exploreHints, blankBoardHints, puzzleHints, freeMoveMode, blankBoardMode, puzzleMode, explorationActive, explorationMode, } = params;
    // 习题解答页：走自己的开关。该页没有手动推演入口，推演也只是短时预览，
    // 因此不再叠加 showHints 判定，避免用户在陪练里关掉教练后习题页也一并失效
    if (puzzleMode)
        return puzzleHints ?? false;
    // 空白棋盘打谱：走自己的开关。摆棋模式下没有可走的着法，不出推荐
    if (blankBoardMode && !explorationActive)
        return blankBoardHints ?? false;
    // 自主探究：走自己的开关。自由走子不进 exploration 状态，故由 freeMoveMode 判定
    if (freeMoveMode && !explorationActive)
        return exploreHints;
    const isManualExploration = explorationActive && explorationMode === 'manual';
    return showHints || isManualExploration;
}
