"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * 游戏结束弹窗
 */
Component({
    properties: {
        show: {
            type: Boolean,
            value: false,
        },
        result: {
            type: String,
            value: '',
        },
        playerSide: {
            type: String,
            value: 'white',
        },
    },
    data: {
        title: '',
        emoji: '',
        subtitle: '',
        resultText: '',
    },
    observers: {
        'result': function (result) {
            if (!result)
                return;
            let playerSide = this.properties.playerSide;
            // 归一化：页面传入的 playerSide 可能是 'w'/'b'，需要转为 'white'/'black'
            if (playerSide === 'w')
                playerSide = 'white';
            else if (playerSide === 'b')
                playerSide = 'black';
            const isWin = result === playerSide ||
                (result === '1-0' && playerSide === 'white') ||
                (result === '0-1' && playerSide === 'black');
            let title, emoji, subtitle;
            if (result === 'draw' || result === '1/2-1/2') {
                title = '和棋';
                emoji = '🤝';
                subtitle = '势均力敌，不分胜负';
            }
            else if (result === 'stalemate') {
                title = '逼和';
                emoji = '🤝';
                subtitle = '无子可动，逼和';
            }
            else if (isWin) {
                title = '你赢了！';
                emoji = '👑';
                subtitle = '恭喜你取得胜利！';
            }
            else {
                title = '你输了';
                emoji = '😔';
                subtitle = '再接再厉，下次会更好！';
            }
            const resultTextMap = {
                '1-0': '白方胜', '0-1': '黑方胜', '1/2-1/2': '和棋',
                'white': '白方胜', 'black': '黑方胜', 'draw': '和棋', 'stalemate': '逼和',
            };
            const resultText = resultTextMap[result] || result;
            this.setData({ title, emoji, subtitle, resultText });
        },
    },
    methods: {
        onUndo() {
            this.triggerEvent('undo');
        },
        /** 立即复盘：直接带当前棋局进入复盘页 */
        onReview() {
            this.triggerEvent('review');
        },
        onNewGame() {
            this.triggerEvent('newgame');
        },
    },
});
