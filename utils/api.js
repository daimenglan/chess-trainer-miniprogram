"use strict";
/**
 * API 请求封装
 * 统一处理认证token、请求/响应拦截、错误处理
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBaseUrl = getBaseUrl;
exports.setBaseUrl = setBaseUrl;
exports.request = request;
exports.sseRequest = sseRequest;
exports.parseSSEChunk = parseSSEChunk;
exports.login = login;
exports.register = register;
exports.forgotPassword = forgotPassword;
exports.resetPassword = resetPassword;
exports.getCurrentUser = getCurrentUser;
exports.requestAIMove = requestAIMove;
exports.saveGame = saveGame;
exports.loadGames = loadGames;
exports.getGameDetail = getGameDetail;
exports.deleteGame = deleteGame;
exports.analyzePosition = analyzePosition;
exports.analyzeMove = analyzeMove;
exports.getAiMoveExplanation = getAiMoveExplanation;
exports.getDetailedAnalysis = getDetailedAnalysis;
exports.getPositionCommentary = getPositionCommentary;
exports.listChessRecords = listChessRecords;
exports.importChessRecords = importChessRecords;
exports.deleteRecord = deleteRecord;
exports.searchChessGames = searchChessGames;
exports.importChessRecordsFromUrl = importChessRecordsFromUrl;
exports.searchAndImportChessGames = searchAndImportChessGames;
exports.reviewGameStream = reviewGameStream;
exports.analyzePositionStream = analyzePositionStream;
exports.explainStream = explainStream;
exports.getPuzzleThemes = getPuzzleThemes;
exports.startPuzzle = startPuzzle;
exports.getAttemptState = getAttemptState;
exports.submitPuzzleMove = submitPuzzleMove;
exports.requestPuzzleHint = requestPuzzleHint;
exports.giveUpPuzzle = giveUpPuzzle;
exports.explainPuzzleStream = explainPuzzleStream;
exports.getWrongBook = getWrongBook;
exports.resolveWrongBook = resolveWrongBook;
exports.addPuzzleFavorite = addPuzzleFavorite;
exports.removePuzzleFavorite = removePuzzleFavorite;
exports.getPuzzleFavorites = getPuzzleFavorites;
exports.getPuzzleStats = getPuzzleStats;
exports.isMembershipEnabled = isMembershipEnabled;
exports.getMembershipLevels = getMembershipLevels;
exports.getMembershipStatus = getMembershipStatus;
exports.getMyMembershipOrders = getMyMembershipOrders;
exports.createMembershipOrder = createMembershipOrder;
exports.payMembershipOrder = payMembershipOrder;
exports.cancelMembershipOrder = cancelMembershipOrder;
exports.redeemMembershipCode = redeemMembershipCode;
exports.getTrainingPlan = getTrainingPlan;
exports.getTrainingStats = getTrainingStats;
exports.getProfile = getProfile;
exports.updateProfile = updateProfile;
exports.uploadAvatar = uploadAvatar;
exports.changePassword = changePassword;
exports.analyzeProfile = analyzeProfile;
exports.askCoachStream = askCoachStream;
exports.getOpeningEncyclopedia = getOpeningEncyclopedia;
exports.getAssessmentQuestionnaire = getAssessmentQuestionnaire;
exports.startAssessment = startAssessment;
exports.submitPuzzleResults = submitPuzzleResults;
exports.submitPuzzleResultsForFullFlow = submitPuzzleResultsForFullFlow;
exports.submitGameMetrics = submitGameMetrics;
exports.submitMultiGameMetrics = submitMultiGameMetrics;
exports.getAdaptiveNextPuzzle = getAdaptiveNextPuzzle;
exports.getAssessmentHistory = getAssessmentHistory;
exports.getAssessmentReport = getAssessmentReport;
exports.abandonAssessment = abandonAssessment;
exports.retakeAssessment = retakeAssessment;
exports.getCurrentAssessment = getCurrentAssessment;
exports.getSavedProfileAnalysis = getSavedProfileAnalysis;
exports.getAdminDashboard = getAdminDashboard;
exports.getAdminTrend = getAdminTrend;
exports.getAdminStats = getAdminStats;
exports.getAdminLogs = getAdminLogs;
exports.getAdminLogStats = getAdminLogStats;
exports.getAdminUsersDetail = getAdminUsersDetail;

// ===== 从网页版补充的 API 导出 =====
exports.loadGame = loadGame;
exports.saveInProgressGame = saveInProgressGame;
exports.getInProgressGame = getInProgressGame;
exports.deleteInProgressGame = deleteInProgressGame;
exports.completeInProgressGame = completeInProgressGame;
exports.getRecordAnalyses = getRecordAnalyses;
exports.getRecordDetail = getRecordDetail;
exports.getRecordDataSources = getRecordDataSources;
exports.addRecordDataSource = addRecordDataSource;
exports.deleteRecordDataSource = deleteRecordDataSource;
exports.triggerRecordAutoUpdate = triggerRecordAutoUpdate;
exports.triggerLearning = triggerLearning;
exports.getKnowledgeStatus = getKnowledgeStatus;
exports.deepReviewGameStream = deepReviewGameStream;
exports.loadDeepReview = loadDeepReview;
exports.saveDeepReview = saveDeepReview;
exports.deleteDeepReview = deleteDeepReview;
exports.getConceptHint = getConceptHint;
exports.createUserPuzzle = createUserPuzzle;
exports.batchCreateUserPuzzles = batchCreateUserPuzzles;
exports.getUserPuzzles = getUserPuzzles;
exports.getDueReviews = getDueReviews;
exports.getUserPuzzleStats = getUserPuzzleStats;
exports.getUserPuzzleDetail = getUserPuzzleDetail;
exports.solveUserPuzzle = solveUserPuzzle;
exports.deleteUserPuzzle = deleteUserPuzzle;
exports.batchDeleteUserPuzzles = batchDeleteUserPuzzles;
exports.getCurrentWeeklyTheme = getCurrentWeeklyTheme;
exports.getWeeklyThemePuzzles = getWeeklyThemePuzzles;
exports.getUpgradePlan = getUpgradePlan;
exports.getTrainingDashboard = getTrainingDashboard;
exports.saveGradeSettings = saveGradeSettings;
exports.saveMistakesFromReview = saveMistakesFromReview;
exports.getMistakeSummary = getMistakeSummary;
exports.getMistakeMatchingPuzzles = getMistakeMatchingPuzzles;
exports.getTrainingCenterData = getTrainingCenterData;
exports.triggerDynamicAssessment = triggerDynamicAssessment;
exports.getWeeklyPlan = getWeeklyPlan;
exports.submitWeeklyEvaluation = submitWeeklyEvaluation;
exports.getWeeklyEvaluations = getWeeklyEvaluations;
exports.isDistributionEnabled = isDistributionEnabled;
exports.isVideoGenerationEnabled = isVideoGenerationEnabled;
exports.isAIAnalysisReportEnabled = isAIAnalysisReportEnabled;
exports.getMembershipToggle = getMembershipToggle;
exports.setMembershipToggle = setMembershipToggle;
exports.getAdminVideoGenerationToggle = getAdminVideoGenerationToggle;
exports.setAdminVideoGenerationToggle = setAdminVideoGenerationToggle;
exports.getAdminAIAnalysisToggle = getAdminAIAnalysisToggle;
exports.setAdminAIAnalysisToggle = setAdminAIAnalysisToggle;
exports.getAdminDistributionToggle = getAdminDistributionToggle;
exports.setAdminDistributionToggle = setAdminDistributionToggle;
exports.generateGameVideo = generateGameVideo;
exports.getVideoStatus = getVideoStatus;
exports.getVideoDownloadUrl = getVideoDownloadUrl;
exports.getVideoVoices = getVideoVoices;
exports.resumeVideoGeneration = resumeVideoGeneration;
exports.getCompletedVideoTasks = getCompletedVideoTasks;
exports.getEnabledAiBots = getEnabledAiBots;
exports.startAiBotMatch = startAiBotMatch;
exports.getMyAiBotGames = getMyAiBotGames;
exports.getAdminAiBots = getAdminAiBots;
exports.getAdminAiBot = getAdminAiBot;
exports.createAdminAiBot = createAdminAiBot;
exports.updateAdminAiBot = updateAdminAiBot;
exports.deleteAdminAiBot = deleteAdminAiBot;
exports.toggleAdminAiBot = toggleAdminAiBot;
exports.generateAdminAiBots = generateAdminAiBots;
exports.batchOnlineAiBots = batchOnlineAiBots;
exports.batchOfflineAiBots = batchOfflineAiBots;
exports.batchDeleteAiBots = batchDeleteAiBots;
exports.getMyDistributionProfile = getMyDistributionProfile;
exports.activateDistributor = activateDistributor;
exports.getMyReferralInfo = getMyReferralInfo;
exports.regenerateReferralCode = regenerateReferralCode;
exports.getMyCommissions = getMyCommissions;
exports.getMyCommissionSummary = getMyCommissionSummary;
exports.getMyTeam = getMyTeam;
exports.createWithdrawalRequest = createWithdrawalRequest;
exports.getMyWithdrawals = getMyWithdrawals;
exports.getDistributionSettings = getDistributionSettings;
exports.updateDistributionSettings = updateDistributionSettings;
exports.getDistributionStats = getDistributionStats;
exports.getDistributors = getDistributors;
exports.getDistributorDetail = getDistributorDetail;
exports.toggleDistributorStatus = toggleDistributorStatus;
exports.getCommissionRules = getCommissionRules;
exports.createCommissionRule = createCommissionRule;
exports.updateCommissionRule = updateCommissionRule;
exports.deleteCommissionRule = deleteCommissionRule;
exports.getAdminCommissionRecords = getAdminCommissionRecords;
exports.settleCommissionManually = settleCommissionManually;
exports.getAdminWithdrawals = getAdminWithdrawals;
exports.approveWithdrawal = approveWithdrawal;
exports.rejectWithdrawal = rejectWithdrawal;
exports.completeWithdrawal = completeWithdrawal;
exports.submitFeedback = submitFeedback;
exports.getMyFeedback = getMyFeedback;
exports.getFeedbackDetail = getFeedbackDetail;
exports.replyToFeedback = replyToFeedback;
exports.getAdminFeedback = getAdminFeedback;
exports.getAdminFeedbackReplies = getAdminFeedbackReplies;
exports.replyFeedback = replyFeedback;
exports.getFeedbackStats = getFeedbackStats;
exports.getPendingSurvey = getPendingSurvey;
exports.submitSurveyResponse = submitSurveyResponse;
exports.skipSurvey = skipSurvey;
exports.getAdminSurveys = getAdminSurveys;
exports.getAdminSurveyDetail = getAdminSurveyDetail;
exports.createSurvey = createSurvey;
exports.updateSurvey = updateSurvey;
exports.deleteSurvey = deleteSurvey;
exports.getSurveyStats = getSurveyStats;
exports.getSurveyResponses = getSurveyResponses;
exports.aiGenerateSurvey = aiGenerateSurvey;
exports.sendMessage = sendMessage;
exports.getMessageSessions = getMessageSessions;
exports.getConversation = getConversation;
exports.getUnreadCount = getUnreadCount;
exports.sendFriendRequest = sendFriendRequest;
exports.acceptFriendRequest = acceptFriendRequest;
exports.rejectFriendRequest = rejectFriendRequest;
exports.getFriendList = getFriendList;
exports.getFriendRequests = getFriendRequests;
exports.removeFriend = removeFriend;
exports.searchUsers = searchUsers;
exports.createGroup = createGroup;
exports.getUserGroups = getUserGroups;
exports.getGroupDetail = getGroupDetail;
exports.updateGroup = updateGroup;
exports.deleteGroup = deleteGroup;
exports.addGroupMembers = addGroupMembers;
exports.removeGroupMember = removeGroupMember;
exports.updateMemberRole = updateMemberRole;
exports.getGroupMessages = getGroupMessages;
exports.sendGroupMessage = sendGroupMessage;
exports.getQuickPhrases = getQuickPhrases;
exports.getEmojis = getEmojis;
exports.getTeacherStatus = getTeacherStatus;
exports.applyTeacher = applyTeacher;
exports.listCoursewares = listCoursewares;
exports.createCourseware = createCourseware;
exports.getCoursewareDetail = getCoursewareDetail;
exports.updateCourseware = updateCourseware;
exports.deleteCourseware = deleteCourseware;
exports.addCoursewareItem = addCoursewareItem;
exports.removeCoursewareItem = removeCoursewareItem;
exports.updateCoursewareItemNote = updateCoursewareItemNote;
exports.reorderCoursewareItems = reorderCoursewareItems;
exports.getAdminTeacherApplications = getAdminTeacherApplications;
exports.getAdminTeacherApplicationCounts = getAdminTeacherApplicationCounts;
exports.reviewAdminTeacherApplication = reviewAdminTeacherApplication;
exports.getAdminTeachers = getAdminTeachers;
exports.revokeAdminTeacher = revokeAdminTeacher;
exports.getDragonCoinBalance = getDragonCoinBalance;
exports.getDragonCoinLedger = getDragonCoinLedger;
exports.getDragonCoinConfigs = getDragonCoinConfigs;
exports.getDragonCoinExchanges = getDragonCoinExchanges;
exports.exchangeDragonCoin = exchangeDragonCoin;
exports.getDragonCoinExchangeRecords = getDragonCoinExchangeRecords;
exports.getAdminDragonCoinConfigs = getAdminDragonCoinConfigs;
exports.createDragonCoinConfig = createDragonCoinConfig;
exports.updateDragonCoinConfig = updateDragonCoinConfig;
exports.deleteDragonCoinConfig = deleteDragonCoinConfig;
exports.getAdminDragonCoinExchanges = getAdminDragonCoinExchanges;
exports.createDragonCoinExchange = createDragonCoinExchange;
exports.updateDragonCoinExchange = updateDragonCoinExchange;
exports.deleteDragonCoinExchange = deleteDragonCoinExchange;
exports.getAdminDragonCoinExchangeRecords = getAdminDragonCoinExchangeRecords;
exports.getAdminDragonCoinUserBalance = getAdminDragonCoinUserBalance;
exports.adjustDragonCoinBalance = adjustDragonCoinBalance;
exports.getAdminDragonCoinStats = getAdminDragonCoinStats;
exports.getAdminDayStats = getAdminDayStats;
exports.getAdminUsers = getAdminUsers;
exports.getAdminUserDetail = getAdminUserDetail;
exports.updateAdminUserRole = updateAdminUserRole;
exports.updateAdminUserTeacherStatus = updateAdminUserTeacherStatus;
exports.adminResetPassword = adminResetPassword;
exports.getAdminUserActivity = getAdminUserActivity;
exports.getAdminUserActivityModules = getAdminUserActivityModules;
exports.getAdminGames = getAdminGames;
exports.getAdminGameDetail = getAdminGameDetail;
exports.getAdminModuleStats = getAdminModuleStats;
exports.getAdminExtendedStats = getAdminExtendedStats;
exports.getAdminSettings = getAdminSettings;
exports.updateAdminSettings = updateAdminSettings;
exports.getAdminKnowledgeStatus = getAdminKnowledgeStatus;
exports.triggerAdminKnowledgeLearn = triggerAdminKnowledgeLearn;
exports.changeAdminPassword = changeAdminPassword;
exports.getAdminMembershipLevels = getAdminMembershipLevels;
exports.getAdminMembershipBenefits = getAdminMembershipBenefits;
exports.createAdminMembershipLevel = createAdminMembershipLevel;
exports.updateAdminMembershipLevel = updateAdminMembershipLevel;
exports.deleteAdminMembershipLevel = deleteAdminMembershipLevel;
exports.getAdminMembershipUsers = getAdminMembershipUsers;
exports.getAdminUserMembership = getAdminUserMembership;
exports.adminGrantMembership = adminGrantMembership;
exports.adminExtendMembership = adminExtendMembership;
exports.adminExpireMembership = adminExpireMembership;
exports.getAdminMembershipOrders = getAdminMembershipOrders;
exports.adminRefundMembershipOrder = adminRefundMembershipOrder;
exports.generateMembershipCodes = generateMembershipCodes;
exports.getMembershipCodes = getMembershipCodes;
exports.disableMembershipCode = disableMembershipCode;
exports.getAdminMembershipStats = getAdminMembershipStats;
exports.getAdminMembershipLogs = getAdminMembershipLogs;
exports.getChessGameRecords = getChessGameRecords;
exports.getChessGameRecordDetail = getChessGameRecordDetail;
exports.deleteChessGameRecord = deleteChessGameRecord;
exports.batchDeleteChessGameRecords = batchDeleteChessGameRecords;
exports.updateChessGameTags = updateChessGameTags;
exports.searchChessGamesExternal = searchChessGamesExternal;
exports.importChessGameFromUrl = importChessGameFromUrl;
exports.searchAndImportChessGame = searchAndImportChessGame;
exports.importChessGamePgn = importChessGamePgn;
exports.getChessDataService = getChessDataService;
exports.createChessGameDataSource = createChessGameDataSource;
exports.updateChessGameDataSource = updateChessGameDataSource;
exports.deleteChessGameDataSource = deleteChessGameDataSource;
exports.testChessGameDataSource = testChessGameDataSource;
exports.importFromChessGameDataSource = importFromChessGameDataSource;
exports.triggerChessGameAutoUpdate = triggerChessGameAutoUpdate;
exports.getChessGameLibraryStats = getChessGameLibraryStats;
exports.getChessGameAnalysis = getChessGameAnalysis;
exports.getChessGameAnalyses = getChessGameAnalyses;
exports.analyzeChessGame = analyzeChessGame;
exports.analyzeAllChessGames = analyzeAllChessGames;
exports.getChessGameBatchAnalysisStatus = getChessGameBatchAnalysisStatus;
exports.cancelChessGameAnalysis = cancelChessGameAnalysis;
exports.cancelAllChessGameAnalyses = cancelAllChessGameAnalyses;
exports.resetAllChessGameAnalyses = resetAllChessGameAnalyses;
exports.deleteChessGameAnalysis = deleteChessGameAnalysis;
exports.getLLMProviders = getLLMProviders;
exports.getLLMProvider = getLLMProvider;
exports.createLLMProvider = createLLMProvider;
exports.updateLLMProvider = updateLLMProvider;
exports.deleteLLMProvider = deleteLLMProvider;
exports.setDefaultLLMProvider = setDefaultLLMProvider;
exports.testLLMConnection = testLLMConnection;
exports.getAdminMenuVisibility = getAdminMenuVisibility;
exports.updateAdminMenuVisibility = updateAdminMenuVisibility;
exports.getSmtpConfig = getSmtpConfig;
exports.saveSmtpConfig = saveSmtpConfig;
exports.deleteSmtpConfig = deleteSmtpConfig;
exports.testSmtpConnection = testSmtpConnection;
exports.getCompetitions = getCompetitions;
exports.getCompetitionDetail = getCompetitionDetail;
exports.joinCompetition = joinCompetition;
exports.getCompetitionRounds = getCompetitionRounds;
exports.getCompetitionStandings = getCompetitionStandings;
exports.getCompetitionNotifications = getCompetitionNotifications;
exports.getCompetitionMatch = getCompetitionMatch;
exports.submitCompetitionMove = submitCompetitionMove;
exports.getCompetitionAdminCompetitions = getCompetitionAdminCompetitions;
exports.createCompetition = createCompetition;
exports.updateCompetition = updateCompetition;
exports.deleteCompetition = deleteCompetition;
exports.getCompetitionManageDetail = getCompetitionManageDetail;
exports.getCompetitionRegistrationPopup = getCompetitionRegistrationPopup;
// 注意：小程序启动阶段 getApp() 可能返回 undefined，必须惰性获取
function getAppSafe() {
    try {
        return typeof getApp === 'function' ? getApp() : null;
    }
    catch {
        return null;
    }
}
// baseUrl 配置（必须为已备案的 HTTPS 域名，小程序服务器域名不接受裸 IP 与非 https 请求）
let baseUrl = 'https://mychess.com.cn';
function getBaseUrl() {
    return baseUrl;
}
function setBaseUrl(url) {
    baseUrl = url;
}
/**
 * 获取认证头
 */
function getAuthHeaders() {
    const app = getAppSafe();
    const token = (app && app.globalData.token) || wx.getStorageSync('auth_token');
    if (token) {
        return { 'Authorization': `Bearer ${token}` };
    }
    return {};
}
/**
 * 通用请求方法
 */
function request(method, url, data = {}, options = {}) {
    return new Promise((resolve, reject) => {
        const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
        const headers = {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
            ...options.headers,
        };
        const requestTask = wx.request({
            url: fullUrl,
            method: method,
            data: data,
            header: headers,
            timeout: options.timeout || 30000,
            enableChunked: options.enableChunked || false,
            responseType: options.responseType || 'text',
            success(res) {
                // 401 未授权 → 清除token并跳转登录
                if (res.statusCode === 401) {
                    const currentApp = getAppSafe();
                    if (currentApp) {
                        currentApp.setToken(null);
                        currentApp.globalData.user = null;
                    }
                    wx.removeStorageSync('auth_token');
                    wx.removeStorageSync('user_info');
                    wx.navigateTo({ url: '/pages/login/login' });
                    reject(new Error(res.data?.error || '未登录'));
                    return;
                }
                // 处理流式响应（SSE）
                if (options.enableChunked) {
                    resolve(res);
                    return;
                }
                const body = res.data;
                if (res.statusCode >= 200 && res.statusCode < 300 && body?.success !== false) {
                    resolve(body);
                }
                else {
                    reject(new Error(body?.error || `请求失败 (${res.statusCode})`));
                }
            },
            fail(err) {
                reject(new Error(err.errMsg || '网络错误'));
            },
        });
        // 如果传入了 abortController
        if (options.abortController) {
            options.abortController.abort = () => {
                requestTask.abort();
            };
        }
    });
}
/**
 * SSE 流式请求解析器
 */
function sseRequest(url, data, callbacks) {
    const { onData, onError, onDone } = callbacks;
    const fullUrl = `${baseUrl}${url}`;
    const requestTask = wx.request({
        url: fullUrl,
        method: 'POST',
        data: data,
        header: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
        },
        enableChunked: true,
        timeout: 120000,
        success(res) {
            if (res.statusCode !== 200) {
                onError?.(new Error(`SSE 请求失败 (${res.statusCode})`));
                onDone?.();
            }
        },
        fail(err) {
            onError?.(new Error(err.errMsg || 'SSE 网络错误'));
            onDone?.();
        },
    });
    return {
        abort: () => { requestTask.abort(); onDone?.(); },
    };
}
/**
 * 解析SSE数据块
 */
function parseSSEChunk(chunk) {
    const lines = chunk.split('\n');
    const events = [];
    let currentEvent = 'message';
    for (const line of lines) {
        if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
        }
        else if (line.startsWith('data: ')) {
            events.push({
                event: currentEvent,
                data: line.slice(6).trim(),
            });
        }
        else if (line === '') {
            currentEvent = 'message';
        }
    }
    return events;
}
// ===== API 方法 =====
// ---- 认证 ----
function login(username, password) {
    return request('POST', '/api/auth/login', { username, password });
}
function register(username, password, email) {
    return request('POST', '/api/auth/register', { username, password, email });
}
/** 忘记密码：发送验证码到邮箱 */
function forgotPassword(email) {
    return request('POST', '/api/auth/forgot-password', { email });
}
/** 重置密码：验证码校验 + 设置新密码 */
function resetPassword(email, code, newPassword) {
    return request('POST', '/api/auth/reset-password', { email, code, newPassword });
}
function getCurrentUser() {
    return request('GET', '/api/auth/me');
}
// ---- 对局 ----
function requestAIMove(fen, difficulty = 5) {
    return request('POST', '/api/ai-move', { fen, difficulty });
}
function saveGame(data) {
    return request('POST', '/api/games', data);
}
function loadGames(params = {}) {
    return request('GET', '/api/games', params);
}
function getGameDetail(gameId) {
    return request('GET', `/api/games/${gameId}`);
}
function deleteGame(gameId) {
    return request('DELETE', `/api/games/${gameId}`);
}
// ---- 分析 ----
function analyzePosition(data) {
    return request('POST', '/api/analyze', data);
}
function analyzeMove(data) {
    return request('POST', '/api/analyze-move', data);
}
function getAiMoveExplanation(fen, uci, depth = 10) {
    return request('POST', '/api/analyze/explain-last-move', { fen, uci, depth });
}
function getDetailedAnalysis(fen, depth = 10, multiPv = 3) {
    return request('POST', '/api/analyze/detailed', { fen, depth, multiPv });
}
function getPositionCommentary(fen, depth = 10) {
    return request('POST', '/api/analyze/commentary', { fen, depth });
}
// ---- 棋谱 ----
function listChessRecords(params = {}) {
    return request('GET', '/api/records', params);
}
function importChessRecords(pgnText) {
    return request('POST', '/api/records/import', { pgnText });
}
function deleteRecord(recordId) {
    return request('DELETE', `/api/records/${recordId}`);
}
// ---- 个人资料 ----
function getProfile() {
    return request('GET', '/api/profile');
}
function updateProfile(data) {
    return request('PUT', '/api/profile', data);
}
function uploadAvatar(filePath) {
    return new Promise((resolve, reject) => {
        const token = getAuthHeaders()['Authorization']?.slice(7) || wx.getStorageSync('auth_token');
        wx.uploadFile({
            url: `${baseUrl}/api/profile/avatar`,
            filePath: filePath,
            name: 'avatar',
            header: {
                'Authorization': `Bearer ${token}`,
            },
            success(res) {
                try {
                    const body = JSON.parse(res.data);
                    if (body.success) {
                        resolve(body);
                    }
                    else {
                        reject(new Error(body.error || '上传失败'));
                    }
                }
                catch {
                    reject(new Error('上传失败'));
                }
            },
            fail(err) {
                reject(new Error(err.errMsg || '网络错误'));
            },
        });
    });
}
function changePassword(oldPassword, newPassword) {
    return request('PUT', '/api/profile/password', { oldPassword, newPassword });
}
function analyzeProfile() {
    return request('POST', '/api/profile/analyze');
}
// ---- 教练 ----
function askCoachStream(options) {
    const sse = require('./sse');
    return sse.createSSERequest('/api/coach/ask', {
        fen: options.fen,
        moveHistory: options.moveHistory,
        question: options.question,
    }, {
        onEvent: (evt) => {
            if (evt.type === 'chunk' && typeof evt.content === 'string') {
                options.onChunk && options.onChunk(evt.content);
            }
        },
        onError: (err) => options.onError && options.onError(err),
        onDone: () => options.onDone && options.onDone(),
    });
}
// ---- 开局百科 ----
function getOpeningEncyclopedia(data) {
    return request('POST', '/api/opening/encyclopedia', data);
}
// ===== 棋谱搜索与全网导入 API =====
/**
 * 全网搜索棋谱
 * @param query 搜索关键词（棋手名/对局ID/开局名）
 * @param source 数据源：lichess | chesscom | web
 * @param maxResults 最大结果数
 */
function searchChessGames(query, source = 'lichess', maxResults = 10) {
    return request('POST', '/api/records/search', { query, source, maxResults });
}
/**
 * 从 URL 导入棋谱（支持 Lichess/Chess.com 对局链接或 PGN 文件 URL）
 */
function importChessRecordsFromUrl(url) {
    return request('POST', '/api/records/import-from-url', { url });
}
/**
 * 搜索并直接导入到棋谱库
 */
function searchAndImportChessGames(query, source = 'lichess', maxResults = 10) {
    return request('POST', '/api/records/search-and-import', { query, source, maxResults });
}
// ===== 棋谱分析（SSE 流式复盘） =====
/**
 * 整局复盘 SSE — 接收走法历史，逐条回调每步分析结果
 */
function reviewGameStream(moveHistory, callbacks, depth = 10, movetime = 250) {
    const sse = require('./sse');
    return sse.createSSERequest('/api/analyze/review', {
        moveHistory, depth, movetime,
    }, {
        onEvent: (evt) => {
            if (evt.type === 'review' && evt.data) {
                callbacks.onReview && callbacks.onReview({ ...evt.data, progress: evt.progress });
            }
            else if (evt.type === 'done') {
                callbacks.onDone && callbacks.onDone();
            }
            else if (evt.type === 'error') {
                callbacks.onError && callbacks.onError(new Error(evt.message));
            }
        },
        onError: (err) => callbacks.onError && callbacks.onError(err),
        onDone: () => callbacks.onDone && callbacks.onDone(),
    });
}
/**
 * SSE 流式局面分析（引擎候选走法 + LLM 文字点评）
 */
function analyzePositionStream(fen, callbacks, depth = 10, multiPv = 3, movetime = 300, pgn) {
    const sse = require('./sse');
    return sse.createSSERequest('/api/analyze/stream', {
        fen, depth, multiPv, movetime, pgn,
    }, {
        onEvent: (evt) => {
            if (evt.type === 'candidates') {
                callbacks.onCandidates && callbacks.onCandidates(evt.data);
            }
            else if (evt.type === 'chunk') {
                callbacks.onChunk && callbacks.onChunk(evt.content);
            }
            else if (evt.type === 'done') {
                callbacks.onDone && callbacks.onDone();
            }
            else if (evt.type === 'error') {
                callbacks.onError && callbacks.onError(new Error(evt.message));
            }
        },
        onError: (err) => callbacks.onError && callbacks.onError(err),
        onDone: () => callbacks.onDone && callbacks.onDone(),
    });
}
/**
 * SSE 流式 AI 教练讲解（习题讲解、局面讲解等通用）
 */
function explainStream(url, callbacks) {
    const sse = require('./sse');
    return sse.createSSERequest(url, {}, {
        onEvent: (evt) => {
            if (evt.type === 'chunk') {
                callbacks.onChunk && callbacks.onChunk(evt.content);
            }
            else if (evt.type === 'done') {
                callbacks.onDone && callbacks.onDone();
            }
            else if (evt.type === 'error') {
                callbacks.onError && callbacks.onError(new Error(evt.message));
            }
        },
        onError: (err) => callbacks.onError && callbacks.onError(err),
        onDone: () => callbacks.onDone && callbacks.onDone(),
    });
}
// ===== 习题（Puzzle）API =====
/**
 * 获取习题主题目录
 */
function getPuzzleThemes() {
    return request('GET', '/api/puzzles/themes');
}
/**
 * 开始做习题
 */
function startPuzzle(filters) {
    return request('POST', '/api/puzzles/puzzles/start', filters || {});
}
/**
 * 获取习题做题状态
 */
function getAttemptState(attemptId) {
    return request('GET', `/api/puzzles/puzzles/attempt/${attemptId}`);
}
/**
 * 提交走子
 */
function submitPuzzleMove(attemptId, uci) {
    return request('POST', `/api/puzzles/puzzles/attempt/${attemptId}/move`, { move: uci });
}
/**
 * 请求提示
 */
function requestPuzzleHint(attemptId) {
    return request('POST', `/api/puzzles/puzzles/attempt/${attemptId}/hint`);
}
/**
 * 放弃习题
 */
function giveUpPuzzle(attemptId) {
    return request('POST', `/api/puzzles/puzzles/attempt/${attemptId}/giveup`);
}
/**
 * SSE 流式习题 AI 讲解
 */
function explainPuzzleStream(attemptId, callbacks) {
    const sse = require('./sse');
    return sse.createSSERequest(`/api/puzzles/puzzles/attempt/${attemptId}/explain`, {}, {
        onEvent: (evt) => {
            if (evt.type === 'chunk') {
                callbacks.onChunk && callbacks.onChunk(evt.content);
            }
            else if (evt.type === 'done') {
                callbacks.onDone && callbacks.onDone();
            }
            else if (evt.type === 'error') {
                callbacks.onError && callbacks.onError(new Error(evt.message));
            }
        },
        onError: (err) => callbacks.onError && callbacks.onError(err),
        onDone: () => callbacks.onDone && callbacks.onDone(),
    });
}
/**
 * 获取错题本
 */
function getWrongBook(page = 1, pageSize = 20, includeResolved = false) {
    return request('GET', '/api/puzzles/wrong-book', { page, pageSize, includeResolved });
}
/**
 * 标记错题已解决
 */
function resolveWrongBook(puzzleId) {
    return request('POST', `/api/puzzles/wrong-book/${puzzleId}/resolve`);
}
/**
 * 收藏习题
 */
function addPuzzleFavorite(puzzleId) {
    return request('POST', `/api/puzzles/favorites/${puzzleId}`);
}
/**
 * 取消收藏习题
 */
function removePuzzleFavorite(puzzleId) {
    return request('DELETE', `/api/puzzles/favorites/${puzzleId}`);
}
/**
 * 获取收藏列表
 */
function getPuzzleFavorites(page = 1, pageSize = 20) {
    return request('GET', '/api/puzzles/favorites', { page, pageSize });
}
/**
 * 获取习题统计
 */
function getPuzzleStats() {
    return request('GET', '/api/puzzles/stats');
}
// ===== 会员（Membership）API =====
/**
 * 检查会员系统是否启用
 */
function isMembershipEnabled() {
    return request('GET', '/api/membership/enabled');
}
/**
 * 获取会员等级与权益信息（未登录可浏览）
 */
function getMembershipLevels() {
    return request('GET', '/api/membership/levels');
}
/**
 * 获取当前会员状态与配额用量（需登录）
 */
function getMembershipStatus() {
    return request('GET', '/api/membership/status');
}
/**
 * 获取我的会员订单列表
 */
function getMyMembershipOrders(page = 1, limit = 10) {
    return request('GET', '/api/membership/orders', { page, limit });
}
/**
 * 创建购买订单
 */
function createMembershipOrder(levelId, priceId) {
    return request('POST', '/api/membership/orders', { levelId, priceId });
}
/**
 * 模拟支付确认
 */
function payMembershipOrder(orderId) {
    return request('POST', `/api/membership/orders/${orderId}/pay`);
}
/**
 * 取消待支付订单
 */
function cancelMembershipOrder(orderId) {
    return request('POST', `/api/membership/orders/${orderId}/cancel`);
}
/**
 * 兑换码开通/续费会员
 */
function redeemMembershipCode(code) {
    return request('POST', '/api/membership/redeem', { code });
}
// ===== 训练计划 API =====
/**
 * 获取个性化训练推荐（基于棋手分析的习题训练计划 + 对局难度推荐）
 */
function getTrainingPlan() {
    return request('GET', '/api/profile/training-plan');
}
/**
 * 获取训练跟踪统计数据（经验值/等级/连续打卡/成就等）
 */
function getTrainingStats() {
    return request('GET', '/api/profile/training-stats');
}
// ===== AI 定级测评 API =====
/**
 * 获取定级问卷
 */
function getAssessmentQuestionnaire() {
    return request('GET', '/api/assessment/questionnaire');
}
/**
 * 创建定级会话
 */
function startAssessment(answers, mode) {
    return request('POST', '/api/assessment/start', { answers, mode });
}
/**
 * 提交习题定级结果，返回定级报告
 */
function submitPuzzleResults(assessmentId, results) {
    return request('POST', `/api/assessment/${assessmentId}/submit-puzzles`, { results });
}
/**
 * 三步向导式：提交习题结果，仅保存中间结果不生成报告。
 * 返回 { puzzleElo, suggestedDifficulty } 供对弈阶段使用。
 */
function submitPuzzleResultsForFullFlow(assessmentId, results) {
    return request('POST', `/api/assessment/${assessmentId}/submit-puzzles`, { results, flow: 'three-step' });
}
/**
 * 查询进行中的定级会话（页面刷新恢复用，无则返回 null）
 */
function getCurrentAssessment() {
    return request('GET', '/api/assessment/current');
}
/**
 * 提交对弈复盘指标，返回定级报告
 */
function submitGameMetrics(assessmentId, submission) {
    return request('POST', `/api/assessment/${assessmentId}/submit-game`, submission);
}
/**
 * 提交多局综合复盘指标，返回定级报告
 */
function submitMultiGameMetrics(assessmentId, games) {
    return request('POST', `/api/assessment/${assessmentId}/submit-multi-game`, { games });
}
/**
 * 自适应取下一题
 */
function getAdaptiveNextPuzzle(assessmentId, lastResult) {
    return request('POST', `/api/assessment/${assessmentId}/next-puzzle`, { lastResult: lastResult || null });
}
/**
 * 历史定级报告列表
 */
function getAssessmentHistory() {
    return request('GET', '/api/assessment/history');
}
/**
 * 读取单份定级报告
 */
function getAssessmentReport(assessmentId) {
    return request('GET', `/api/assessment/${assessmentId}`);
}
/**
 * 放弃进行中的定级
 */
function abandonAssessment(assessmentId) {
    return request('POST', `/api/assessment/${assessmentId}/abandon`);
}
/**
 * 在已有报告基础上再测一次
 */
function retakeAssessment(previousAssessmentId, mode) {
    return request('POST', `/api/assessment/${previousAssessmentId}/retake`, { mode });
}
/**
 * 获取已保存的棋手分析结果（不重新分析）
 */
function getSavedProfileAnalysis() {
    return request('GET', '/api/profile/analyze');
}
/* ==================== 管理后台：数据监控与统计分析 ==================== */
/**
 * 管理端仪表盘汇总（今日指标 + 系统总览）
 */
function getAdminDashboard() {
    return request('GET', '/api/admin/dashboard');
}
/**
 * 管理端近 N 日趋势（新注册/登录/对局用户）
 */
function getAdminTrend(days = 7) {
    return request('GET', '/api/admin/dashboard/trend', { days });
}
/**
 * 管理端统计分析（对局结果/难度分布、30日趋势、模块时长）
 */
function getAdminStats() {
    return request('GET', '/api/admin/stats');
}
/**
 * 管理端系统日志（分页，支持操作类型与日期筛选）
 */
function getAdminLogs(params = {}) {
    return request('GET', '/api/admin/logs', params);
}
/**
 * 管理端日志统计
 */
function getAdminLogStats(params = {}) {
    return request('GET', '/api/admin/logs/stats', params);
}
/**
 * 管理端用户明细（数据监控用）
 * 支持日期范围、用户名模糊查询、列排序
 */
function getAdminUsersDetail(params = {}) {
    return request('GET', '/api/admin/users/detail', params);
}
// ===== 从网页版补充的 API 函数实现 =====
function loadGame(gameId) { return request('GET', '/api/games/' + gameId); }
function saveInProgressGame(data) { return request('POST', '/api/games/save-in-progress', data); }
function getInProgressGame() { return request('GET', '/api/games/in-progress'); }
function deleteInProgressGame(gameId) { return request('DELETE', '/api/games/' + gameId); }
function completeInProgressGame(gameId, result, pgn, timeControl) { return request('PUT', '/api/games/' + gameId + '/complete', { result, pgn, timeControl }); }
function getRecordAnalyses(ids) { return request('POST', '/api/records/analyses', { ids }); }
function getRecordDetail(id) { return request('GET', '/api/records/' + id); }
function getRecordDataSources() { return request('GET', '/api/admin/records/sources'); }
function addRecordDataSource(input) { return request('POST', '/api/admin/records/sources', input); }
function deleteRecordDataSource(id) { return request('DELETE', '/api/admin/records/sources/' + id); }
function triggerRecordAutoUpdate() { return request('POST', '/api/admin/records/auto-update'); }
function triggerLearning() { return request('POST', '/api/knowledge/learn'); }
function getKnowledgeStatus() { return request('GET', '/api/knowledge/status'); }
function deepReviewGameStream(moveHistory, callbacks, depth, movetime) {
    depth = depth || 12; movetime = movetime || 250;
    var sse = require('./sse');
    return sse.createSSERequest('/api/analyze/deep-review', { moveHistory: moveHistory, depth: depth, movetime: movetime }, {
        onEvent: function(evt) {
            if (evt.type === 'engine') { callbacks.onEngine && callbacks.onEngine({ data: evt.data, progress: evt.progress || 0 }); }
            else if (evt.type === 'llm') { callbacks.onLLM && callbacks.onLLM(evt.data); }
            else if (evt.type === 'summary') { callbacks.onSummary && callbacks.onSummary(evt.data); }
            else if (evt.type === 'done') { callbacks.onDone && callbacks.onDone(); }
            else if (evt.type === 'error') { callbacks.onError && callbacks.onError(new Error(evt.message)); }
        },
        onError: function(err) { callbacks.onError && callbacks.onError(err); },
        onDone: function() { callbacks.onDone && callbacks.onDone(); },
    });
}
function loadDeepReview(gameId, recordId) {
    var params = {};
    if (gameId) params.gameId = gameId;
    if (recordId) params.recordId = recordId;
    return request('GET', '/api/analyze/deep-review/load', params);
}
function saveDeepReview(gameId, recordId, moveReviews, gameSummary) { return request('POST', '/api/analyze/deep-review/save', { gameId: gameId, recordId: recordId, moveReviews: moveReviews, gameSummary: gameSummary }); }
function deleteDeepReview(gameId, recordId) { return request('DELETE', '/api/analyze/deep-review', { gameId: gameId, recordId: recordId }); }
function getConceptHint(fen, depth) { return request('POST', '/api/analyze/concept-hint', { fen: fen, depth: depth }); }
function createUserPuzzle(data) { return request('POST', '/api/user-puzzles', data); }
function batchCreateUserPuzzles(puzzles) { return request('POST', '/api/user-puzzles/batch', { puzzles: puzzles }); }
function getUserPuzzles(filters) { return request('GET', '/api/user-puzzles', filters); }
function getDueReviews(limit) { return request('GET', '/api/user-puzzles/due', { limit: limit }); }
function getUserPuzzleStats() { return request('GET', '/api/user-puzzles/stats'); }
function getUserPuzzleDetail(id) { return request('GET', '/api/user-puzzles/' + id); }
function solveUserPuzzle(id, correct) { return request('POST', '/api/user-puzzles/' + id + '/solve', { correct: correct }); }
function deleteUserPuzzle(id) { return request('DELETE', '/api/user-puzzles/' + id); }
function batchDeleteUserPuzzles(ids) { return request('POST', '/api/user-puzzles/batch-delete', { ids: ids }); }
function getCurrentWeeklyTheme() { return request('GET', '/api/weekly-themes/current'); }
function getWeeklyThemePuzzles(themeKey, limit) { return request('GET', '/api/weekly-themes/current/puzzles', { themeKey: themeKey, limit: limit }); }
function getUpgradePlan() { return request('GET', '/api/profile/upgrade-plan'); }
function getTrainingDashboard() { return request('GET', '/api/profile/training-dashboard'); }
function saveGradeSettings(currentGrade, targetGrade) { return request('POST', '/api/profile/upgrade-plan/settings', { currentGrade: currentGrade, targetGrade: targetGrade }); }
function saveMistakesFromReview(data) { return request('POST', '/api/profile/mistakes/save', data); }
function getMistakeSummary() { return request('GET', '/api/profile/mistakes/active'); }
function getMistakeMatchingPuzzles(limit) { return request('GET', '/api/profile/mistakes/puzzles', { limit: limit }); }
function getTrainingCenterData() { return request('GET', '/api/profile/training-center'); }
function triggerDynamicAssessment() { return request('POST', '/api/profile/dynamic-assessment'); }
function getWeeklyPlan(refresh) { return request('GET', '/api/profile/weekly-plan', { refresh: refresh ? 1 : undefined }); }
function submitWeeklyEvaluation(data) { return request('POST', '/api/profile/weekly-evaluation', data); }
function getWeeklyEvaluations() { return request('GET', '/api/profile/weekly-evaluations'); }
function isDistributionEnabled() { return request('GET', '/api/settings/distribution-enabled'); }
function isVideoGenerationEnabled() { return request('GET', '/api/settings/video-generation-enabled'); }
function isAIAnalysisReportEnabled() { return request('GET', '/api/settings/ai-analysis-report-enabled'); }
function getMembershipToggle() { return request('GET', '/api/admin/settings/membership-enabled'); }
function setMembershipToggle(enabled) { return request('PUT', '/api/admin/settings/membership-enabled', { enabled: enabled }); }
function getAdminVideoGenerationToggle() { return request('GET', '/api/admin/settings/video-generation-enabled'); }
function setAdminVideoGenerationToggle(enabled) { return request('PUT', '/api/admin/settings/video-generation-enabled', { enabled: enabled }); }
function getAdminAIAnalysisToggle() { return request('GET', '/api/admin/settings/ai-analysis-report-enabled'); }
function setAdminAIAnalysisToggle(enabled) { return request('PUT', '/api/admin/settings/ai-analysis-report-enabled', { enabled: enabled }); }
function getAdminDistributionToggle() { return request('GET', '/api/admin/settings/distribution-enabled'); }
function setAdminDistributionToggle(enabled) { return request('PUT', '/api/admin/settings/distribution-enabled', { enabled: enabled }); }
function generateGameVideo(ids, config) { return request('POST', '/api/video/generate', Object.assign({}, ids, { config: config })); }
function getVideoStatus(taskId) { return request('GET', '/api/video/status/' + taskId); }
function getVideoDownloadUrl(taskId) { return getBaseUrl() + '/api/video/download/' + taskId; }
function getVideoVoices() { return request('GET', '/api/video/voices'); }
function resumeVideoGeneration(taskId) { return request('POST', '/api/video/resume/' + taskId); }
function getCompletedVideoTasks() { return request('GET', '/api/video/completed'); }
function getEnabledAiBots() { return request('GET', '/api/ai-bots/enabled'); }
function startAiBotMatch(botId, userSide, timeControl) { return request('POST', '/api/ai-bots/start-match', { botId: botId, userSide: userSide, timeControl: timeControl }); }
function getMyAiBotGames() { return request('GET', '/api/ai-bots/my-games'); }
function getAdminAiBots() { return request('GET', '/api/admin/ai-bots'); }
function getAdminAiBot(id) { return request('GET', '/api/admin/ai-bots/' + id); }
function createAdminAiBot(data) { return request('POST', '/api/admin/ai-bots', data); }
function updateAdminAiBot(id, data) { return request('PUT', '/api/admin/ai-bots/' + id, data); }
function deleteAdminAiBot(id) { return request('DELETE', '/api/admin/ai-bots/' + id); }
function toggleAdminAiBot(id) { return request('PATCH', '/api/admin/ai-bots/' + id + '/toggle'); }
function generateAdminAiBots(request) { return request('POST', '/api/admin/ai-bots/generate', request); }
function batchOnlineAiBots(count) { return request('POST', '/api/admin/ai-bots/batch-online', { count: count }); }
function batchOfflineAiBots(count) { return request('POST', '/api/admin/ai-bots/batch-offline', { count: count }); }
function batchDeleteAiBots(count) { return request('POST', '/api/admin/ai-bots/batch-delete', { count: count }); }
function getMyDistributionProfile() { return request('GET', '/api/distribution/my-profile'); }
function activateDistributor() { return request('POST', '/api/distribution/activate'); }
function getMyReferralInfo() { return request('GET', '/api/distribution/referral-info'); }
function regenerateReferralCode() { return request('POST', '/api/distribution/referral-code/regenerate'); }
function getMyCommissions(page, limit, status) { return request('GET', '/api/distribution/commissions', { page: page, limit: limit, status: status }); }
function getMyCommissionSummary() { return request('GET', '/api/distribution/commissions/summary'); }
function getMyTeam(page, limit) { return request('GET', '/api/distribution/team', { page: page, limit: limit }); }
function createWithdrawalRequest(amount, paymentType, accountInfo) { return request('POST', '/api/distribution/withdrawals', { amount: amount, paymentType: paymentType, accountInfo: accountInfo }); }
function getMyWithdrawals(page, limit, status) { return request('GET', '/api/distribution/withdrawals', { page: page, limit: limit, status: status }); }
function getDistributionSettings() { return request('GET', '/api/admin/distribution/settings'); }
function updateDistributionSettings(settings) { return request('PUT', '/api/admin/distribution/settings', settings); }
function getDistributionStats() { return request('GET', '/api/admin/distribution/stats'); }
function getDistributors(page, limit, search, status) {
    var params = { page: page, limit: limit };
    if (search) params.search = search;
    if (status !== undefined) params.status = status;
    return request('GET', '/api/admin/distribution/distributors', params);
}
function getDistributorDetail(userId) { return request('GET', '/api/admin/distribution/distributors/' + userId); }
function toggleDistributorStatus(userId, status, reason) { return request('PUT', '/api/admin/distribution/distributors/' + userId + '/status', { status: status, reason: reason }); }
function getCommissionRules() { return request('GET', '/api/admin/distribution/commission-rules'); }
function createCommissionRule(rule) { return request('POST', '/api/admin/distribution/commission-rules', rule); }
function updateCommissionRule(id, rule) { return request('PUT', '/api/admin/distribution/commission-rules/' + id, rule); }
function deleteCommissionRule(id) { return request('DELETE', '/api/admin/distribution/commission-rules/' + id); }
function getAdminCommissionRecords(page, limit, status, levelId) {
    var params = { page: page, limit: limit };
    if (status) params.status = status;
    if (levelId) params.levelId = levelId;
    return request('GET', '/api/admin/distribution/commissions', params);
}
function settleCommissionManually(orderId) { return request('POST', '/api/admin/distribution/commissions/settle', { orderId: orderId }); }
function getAdminWithdrawals(page, limit, status) {
    var params = { page: page, limit: limit };
    if (status) params.status = status;
    return request('GET', '/api/admin/distribution/withdrawals', params);
}
function approveWithdrawal(id, note) { return request('POST', '/api/admin/distribution/withdrawals/' + id + '/approve', { note: note }); }
function rejectWithdrawal(id, reason) { return request('POST', '/api/admin/distribution/withdrawals/' + id + '/reject', { reason: reason }); }
function completeWithdrawal(id) { return request('POST', '/api/admin/distribution/withdrawals/' + id + '/complete'); }
function submitFeedback(data) { return request('POST', '/api/feedback', data); }
function getMyFeedback(page, limit) { return request('GET', '/api/feedback', { page: page, limit: limit }); }
function getFeedbackDetail(id) { return request('GET', '/api/feedback/' + id); }
function replyToFeedback(id, content) { return request('POST', '/api/feedback/' + id + '/reply', { content: content }); }
function getAdminFeedback(page, limit, status, type) {
    var params = { page: page, limit: limit };
    if (status) params.status = status;
    if (type) params.type = type;
    return request('GET', '/api/admin/feedback', params);
}
function getAdminFeedbackReplies(id) { return request('GET', '/api/admin/feedback/' + id + '/replies'); }
function replyFeedback(id, reply, status) { return request('POST', '/api/admin/feedback/' + id + '/reply', { reply: reply, status: status }); }
function getFeedbackStats() { return request('GET', '/api/admin/feedback/stats'); }
function getPendingSurvey() { return request('GET', '/api/surveys/pending'); }
function submitSurveyResponse(surveyId, answers) { return request('POST', '/api/surveys/' + surveyId + '/respond', { answers: answers }); }
function skipSurvey(surveyId, skipType) { return request('POST', '/api/surveys/' + surveyId + '/skip', { skipType: skipType }); }
function getAdminSurveys(page, limit, status) {
    var params = { page: page, limit: limit };
    if (status) params.status = status;
    return request('GET', '/api/admin/surveys', params);
}
function getAdminSurveyDetail(id) { return request('GET', '/api/admin/surveys/' + id); }
function createSurvey(data) { return request('POST', '/api/admin/surveys', data); }
function updateSurvey(id, data) { return request('PUT', '/api/admin/surveys/' + id, data); }
function deleteSurvey(id) { return request('DELETE', '/api/admin/surveys/' + id); }
function getSurveyStats(id) { return request('GET', '/api/admin/surveys/' + id + '/stats'); }
function getSurveyResponses(id, page, limit) { return request('GET', '/api/admin/surveys/' + id + '/responses', { page: page, limit: limit }); }
function aiGenerateSurvey(purpose, requirements, questionCount) { return request('POST', '/api/admin/surveys/ai-generate', { purpose: purpose, requirements: requirements, questionCount: questionCount }); }
function sendMessage(data) { return request('POST', '/api/messages', data); }
function getMessageSessions() { return request('GET', '/api/messages'); }
function getConversation(userId) { return request('GET', '/api/messages/' + userId); }
function getUnreadCount() { return request('GET', '/api/messages/unread-count'); }
function sendFriendRequest(toUserId, message) { return request('POST', '/api/friends/request', { toUserId: toUserId, message: message }); }
function acceptFriendRequest(requestId) { return request('POST', '/api/friends/accept/' + requestId); }
function rejectFriendRequest(requestId) { return request('POST', '/api/friends/reject/' + requestId); }
function getFriendList() { return request('GET', '/api/friends'); }
function getFriendRequests() { return request('GET', '/api/friends/requests'); }
function removeFriend(userId) { return request('DELETE', '/api/friends/' + userId); }
function searchUsers(q) { return request('GET', '/api/users/search', { q: q }); }
function createGroup(name, description, memberIds) { return request('POST', '/api/groups', { name: name, description: description, memberIds: memberIds }); }
function getUserGroups() { return request('GET', '/api/groups'); }
function getGroupDetail(groupId) { return request('GET', '/api/groups/' + groupId); }
function updateGroup(groupId, data) { return request('PUT', '/api/groups/' + groupId, data); }
function deleteGroup(groupId) { return request('DELETE', '/api/groups/' + groupId); }
function addGroupMembers(groupId, memberIds) { return request('POST', '/api/groups/' + groupId + '/members', { memberIds: memberIds }); }
function removeGroupMember(groupId, userId) { return request('DELETE', '/api/groups/' + groupId + '/members/' + userId); }
function updateMemberRole(groupId, userId, role) { return request('PUT', '/api/groups/' + groupId + '/members/' + userId, { role: role }); }
function getGroupMessages(groupId, page, limit) { return request('GET', '/api/groups/' + groupId + '/messages', { page: page, limit: limit }); }
function sendGroupMessage(groupId, content, type) { return request('POST', '/api/groups/' + groupId + '/messages', { groupId: groupId, content: content, type: type }); }
function getQuickPhrases() { return request('GET', '/api/quick-phrases'); }
function getEmojis() { return request('GET', '/api/emojis'); }
function getTeacherStatus() { return request('GET', '/api/teacher/status'); }
function applyTeacher(data) { return request('POST', '/api/teacher/apply', data); }
function listCoursewares() { return request('GET', '/api/coursewares'); }
function createCourseware(data) { return request('POST', '/api/coursewares', data); }
function getCoursewareDetail(id) { return request('GET', '/api/coursewares/' + id); }
function updateCourseware(id, data) { return request('PUT', '/api/coursewares/' + id, data); }
function deleteCourseware(id) { return request('DELETE', '/api/coursewares/' + id); }
function addCoursewareItem(coursewareId, itemId, itemType, note) { return request('POST', '/api/coursewares/' + coursewareId + '/items', { itemId: itemId, itemType: itemType, note: note }); }
function removeCoursewareItem(coursewareId, itemId) { return request('DELETE', '/api/coursewares/' + coursewareId + '/items/' + itemId); }
function updateCoursewareItemNote(coursewareId, itemId, note) { return request('PUT', '/api/coursewares/' + coursewareId + '/items/' + itemId, { note: note }); }
function reorderCoursewareItems(coursewareId, itemIds) { return request('POST', '/api/coursewares/' + coursewareId + '/items/reorder', { itemIds: itemIds }); }
function getAdminTeacherApplications(page, limit, status) {
    var params = { page: page, limit: limit };
    if (status) params.status = status;
    return request('GET', '/api/admin/teachers/applications', params);
}
function getAdminTeacherApplicationCounts() { return request('GET', '/api/admin/teachers/application-counts'); }
function reviewAdminTeacherApplication(applicationId, status, note) { return request('POST', '/api/admin/teachers/applications/' + applicationId + '/review', { status: status, note: note }); }
function getAdminTeachers(page, limit) { return request('GET', '/api/admin/teachers', { page: page, limit: limit }); }
function revokeAdminTeacher(userId) { return request('POST', '/api/admin/teachers/' + userId + '/revoke'); }
function getDragonCoinBalance() { return request('GET', '/api/dragon-coin/balance'); }
function getDragonCoinLedger(page, limit) { return request('GET', '/api/dragon-coin/ledger', { page: page, limit: limit }); }
function getDragonCoinConfigs() { return request('GET', '/api/dragon-coin/configs'); }
function getDragonCoinExchanges(page, limit) { return request('GET', '/api/dragon-coin/exchanges', { page: page, limit: limit }); }
function exchangeDragonCoin(configId, amount) { return request('POST', '/api/dragon-coin/exchange', { configId: configId, amount: amount }); }
function getDragonCoinExchangeRecords(page, limit) { return request('GET', '/api/dragon-coin/exchange-records', { page: page, limit: limit }); }
function getAdminDragonCoinConfigs() { return request('GET', '/api/admin/dragon-coin/configs'); }
function createDragonCoinConfig(data) { return request('POST', '/api/admin/dragon-coin/configs', data); }
function updateDragonCoinConfig(id, data) { return request('PUT', '/api/admin/dragon-coin/configs/' + id, data); }
function deleteDragonCoinConfig(id) { return request('DELETE', '/api/admin/dragon-coin/configs/' + id); }
function getAdminDragonCoinExchanges(page, limit) { return request('GET', '/api/admin/dragon-coin/exchanges', { page: page, limit: limit }); }
function createDragonCoinExchange(data) { return request('POST', '/api/admin/dragon-coin/exchanges', data); }
function updateDragonCoinExchange(id, data) { return request('PUT', '/api/admin/dragon-coin/exchanges/' + id, data); }
function deleteDragonCoinExchange(id) { return request('DELETE', '/api/admin/dragon-coin/exchanges/' + id); }
function getAdminDragonCoinExchangeRecords(page, limit) { return request('GET', '/api/admin/dragon-coin/exchange-records', { page: page, limit: limit }); }
function getAdminDragonCoinUserBalance(userId) { return request('GET', '/api/admin/dragon-coin/users/' + userId + '/balance'); }
function adjustDragonCoinBalance(userId, amount, reason) { return request('POST', '/api/admin/dragon-coin/users/' + userId + '/balance/adjust', { amount: amount, reason: reason }); }
function getAdminDragonCoinStats() { return request('GET', '/api/admin/dragon-coin/stats'); }
function getAdminDayStats(date) { return request('GET', '/api/admin/dashboard/day-stats', { date: date }); }
function getAdminUsers(page, limit, search, levelId, sortField, sortOrder) { return request('GET', '/api/admin/users', { page: page, limit: limit, search: search, levelId: levelId, sortField: sortField, sortOrder: sortOrder }); }
function getAdminUserDetail(userId) { return request('GET', '/api/admin/users/' + userId); }
function updateAdminUserRole(userId, role) { return request('PUT', '/api/admin/users/' + userId, { role: role }); }
function updateAdminUserTeacherStatus(userId, status) { return request('PUT', '/api/admin/users/' + userId, { teacherStatus: status }); }
function adminResetPassword(userId, adminPassword, newPassword) { return request('POST', '/api/admin/users/' + userId + '/reset-password', { adminPassword: adminPassword, newPassword: newPassword }); }
function getAdminUserActivity(userId, days, dateFrom, dateTo) { return request('GET', '/api/admin/users/' + userId + '/activity', { days: days, dateFrom: dateFrom, dateTo: dateTo }); }
function getAdminUserActivityModules(userId, dateFrom, dateTo) { return request('GET', '/api/admin/users/' + userId + '/activity-modules', { dateFrom: dateFrom, dateTo: dateTo }); }
function getAdminGames(page, limit, filters) { return request('GET', '/api/admin/games', Object.assign({ page: page, limit: limit }, filters)); }
function getAdminGameDetail(gameId) { return request('GET', '/api/admin/games/' + gameId); }
function getAdminModuleStats() { return request('GET', '/api/admin/stats/modules'); }
function getAdminExtendedStats(days) { return request('GET', '/api/admin/stats/extended', { days: days }); }
function getAdminSettings() { return request('GET', '/api/admin/settings'); }
function updateAdminSettings(settings) { return request('PUT', '/api/admin/settings', { settings: settings }); }
function getAdminKnowledgeStatus() { return request('GET', '/api/admin/knowledge'); }
function triggerAdminKnowledgeLearn() { return request('POST', '/api/admin/knowledge/learn'); }
function changeAdminPassword(oldPassword, newPassword) { return request('POST', '/api/admin/change-password', { oldPassword: oldPassword, newPassword: newPassword }); }
function getAdminMembershipLevels() { return request('GET', '/api/admin/membership/levels'); }
function getAdminMembershipBenefits() { return request('GET', '/api/admin/membership/benefits'); }
function createAdminMembershipLevel(payload) { return request('POST', '/api/admin/membership/levels', payload); }
function updateAdminMembershipLevel(levelId, payload) { return request('PUT', '/api/admin/membership/levels/' + levelId, payload); }
function deleteAdminMembershipLevel(levelId) { return request('DELETE', '/api/admin/membership/levels/' + levelId); }
function getAdminMembershipUsers(page, limit, params) { return request('GET', '/api/admin/membership/users', Object.assign({ page: page, limit: limit }, params)); }
function getAdminUserMembership(userId) { return request('GET', '/api/admin/membership/users/' + userId + '/detail'); }
function adminGrantMembership(userId, levelId, days, reason) { return request('POST', '/api/admin/membership/users/' + userId + '/grant', { levelId: levelId, days: days, reason: reason }); }
function adminExtendMembership(userId, days, reason) { return request('POST', '/api/admin/membership/users/' + userId + '/extend', { days: days, reason: reason }); }
function adminExpireMembership(userId, reason) { return request('POST', '/api/admin/membership/users/' + userId + '/expire', { reason: reason }); }
function getAdminMembershipOrders(page, limit, filters) { return request('GET', '/api/admin/membership/orders', Object.assign({ page: page, limit: limit }, filters)); }
function adminRefundMembershipOrder(orderId, reason) { return request('POST', '/api/admin/membership/orders/' + orderId + '/refund', { reason: reason }); }
function generateMembershipCodes(options) { return request('POST', '/api/admin/membership/codes', options); }
function getMembershipCodes(page, limit, filters) { return request('GET', '/api/admin/membership/codes', Object.assign({ page: page, limit: limit }, filters)); }
function disableMembershipCode(codeId) { return request('PATCH', '/api/admin/membership/codes/' + codeId + '/disable'); }
function getAdminMembershipStats() { return request('GET', '/api/admin/membership/stats'); }
function getAdminMembershipLogs(page, limit) { return request('GET', '/api/admin/membership/logs', { page: page, limit: limit }); }
function getChessGameRecords(params) { return request('GET', '/api/admin/chess-games/records', params); }
function getChessGameRecordDetail(id) { return request('GET', '/api/admin/chess-games/records/' + id); }
function deleteChessGameRecord(id) { return request('DELETE', '/api/admin/chess-games/records/' + id); }
function batchDeleteChessGameRecords(ids) { return request('POST', '/api/admin/chess-games/records/batch-delete', { ids: ids }); }
function updateChessGameTags(id, tags) { return request('PUT', '/api/admin/chess-games/records/' + id + '/tags', { tags: tags }); }
function searchChessGamesExternal(query, source, maxResults) { return request('POST', '/api/admin/chess-games/records/search', { query: query, source: source, maxResults: maxResults }); }
function importChessGameFromUrl(url) { return request('POST', '/api/admin/chess-games/records/import-url', { url: url }); }
function searchAndImportChessGame(query, source, maxResults) { return request('POST', '/api/admin/chess-games/records/search-and-import', { query: query, source: source, maxResults: maxResults }); }
function importChessGamePgn(pgnText) { return request('POST', '/api/admin/chess-games/records/import-pgn', { pgnText: pgnText }); }
function getChessDataService() { return request('GET', '/api/admin/chess-games/data-sources'); }
function createChessGameDataSource(input) { return request('POST', '/api/admin/chess-games/data-sources', input); }
function updateChessGameDataSource(id, input) { return request('PATCH', '/api/admin/chess-games/data-sources/' + id, input); }
function deleteChessGameDataSource(id) { return request('DELETE', '/api/admin/chess-games/data-sources/' + id); }
function testChessGameDataSource(id) { return request('POST', '/api/admin/chess-games/data-sources/' + id + '/test'); }
function importFromChessGameDataSource(id) { return request('POST', '/api/admin/chess-games/data-sources/' + id + '/import'); }
function triggerChessGameAutoUpdate() { return request('POST', '/api/admin/chess-games/auto-update'); }
function getChessGameLibraryStats() { return request('GET', '/api/admin/chess-games/stats'); }
function getChessGameAnalysis(recordId) { return request('GET', '/api/admin/chess-games/records/' + recordId + '/analysis'); }
function getChessGameAnalyses(ids) { return request('POST', '/api/admin/chess-games/records/analysis/batch', { ids: ids }); }
function analyzeChessGame(recordId, options) { return request('POST', '/api/admin/chess-games/records/' + recordId + '/analyze', options || {}); }
function analyzeAllChessGames(options) { return request('POST', '/api/admin/chess-games/analyze-all', options || {}); }
function getChessGameBatchAnalysisStatus() { return request('GET', '/api/admin/chess-games/analysis-status'); }
function cancelChessGameAnalysis(recordId) { return request('POST', '/api/admin/chess-games/records/' + recordId + '/analyze/cancel'); }
function cancelAllChessGameAnalyses() { return request('POST', '/api/admin/chess-games/analyze/cancel-all'); }
function resetAllChessGameAnalyses() { return request('POST', '/api/admin/chess-games/analyze/reset'); }
function deleteChessGameAnalysis(recordId) { return request('DELETE', '/api/admin/chess-games/records/' + recordId + '/analysis'); }
function getLLMProviders() { return request('GET', '/api/admin/llm-providers'); }
function getLLMProvider(id) { return request('GET', '/api/admin/llm-providers/' + id); }
function createLLMProvider(data) { return request('POST', '/api/admin/llm-providers', data); }
function updateLLMProvider(id, data) { return request('PUT', '/api/admin/llm-providers/' + id, data); }
function deleteLLMProvider(id) { return request('DELETE', '/api/admin/llm-providers/' + id); }
function setDefaultLLMProvider(id) { return request('POST', '/api/admin/llm-providers/' + id + '/default'); }
function testLLMConnection(id) { return request('POST', '/api/admin/llm-providers/' + id + '/test'); }
function getAdminMenuVisibility() { return request('GET', '/api/admin/menus'); }
function updateAdminMenuVisibility(menus) { return request('PUT', '/api/admin/menus', { menus: menus }); }
function getSmtpConfig() { return request('GET', '/api/admin/settings/smtp'); }
function saveSmtpConfig(config) { return request('PUT', '/api/admin/settings/smtp', config); }
function deleteSmtpConfig() { return request('DELETE', '/api/admin/settings/smtp'); }
function testSmtpConnection(config) { return request('POST', '/api/admin/settings/smtp/test', config); }
function getCompetitions(params) { return request('GET', '/api/competitions', params); }
function getCompetitionDetail(id) { return request('GET', '/api/competitions/' + id); }
function joinCompetition(id, data) { return request('POST', '/api/competitions/' + id + '/join', data); }
function getCompetitionRounds(competitionId) { return request('GET', '/api/competitions/' + competitionId + '/rounds'); }
function getCompetitionStandings(competitionId, params) { return request('GET', '/api/competitions/' + competitionId + '/standings', params); }
function getCompetitionNotifications(competitionId) { return request('GET', '/api/competitions/' + competitionId + '/notifications'); }
function getCompetitionMatch(matchId) { return request('GET', '/api/competitions/matches/' + matchId); }
function submitCompetitionMove(matchId, move) { return request('POST', '/api/competitions/matches/' + matchId + '/move', { move: move }); }
function getCompetitionAdminCompetitions(params) { return request('GET', '/api/admin/competitions', params); }
function createCompetition(data) { return request('POST', '/api/admin/competitions', data); }
function updateCompetition(id, data) { return request('PUT', '/api/admin/competitions/' + id, data); }
function deleteCompetition(id) { return request('DELETE', '/api/admin/competitions/' + id); }
function getCompetitionManageDetail(id) { return request('GET', '/api/admin/competitions/' + id); }
function getCompetitionRegistrationPopup() { return request('GET', '/api/competitions/registration-popup'); }