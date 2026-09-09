/**
 * AI教练聊天组件
 */
const api = require('../../utils/api');

Component({
  properties: {
    fen: {
      type: String,
      value: '',
    },
    moveHistory: {
      type: Array,
      value: [],
    },
    gameStarted: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    show: false,
    messages: [] as any[],
    inputValue: '',
    isLoading: false,
    isStreaming: false,
    streamingText: '',
    unreadCount: 0,
    suggestions: [
      '这个局面谁优势？',
      '最佳走法是什么？',
      '给我一些战术提示',
      '分析这个局面的关键',
    ],
  },

  methods: {
    onToggle() {
      const show = !this.data.show;
      this.setData({ show });
      if (show) {
        this.setData({ unreadCount: 0 });
      }
    },

    onInput(e: any) {
      this.setData({ inputValue: e.detail.value });
    },

    onSend() {
      const text = this.data.inputValue.trim();
      if (!text) return;

      const userMsg = { role: 'user', content: text };
      const messages = [...this.data.messages, userMsg];
      this.setData({
        messages,
        inputValue: '',
        isLoading: true,
        isStreaming: true,
        streamingText: '',
      });

      // 添加AI占位消息
      this.setData({
        messages: [...messages, { role: 'assistant', content: '', streaming: true }],
      });

      this.sendToCoach(text);
    },

    sendToCoach(question: string) {
      const fen = this.properties.fen;

      // SSE 流式请求，逐块追加到最后一条 AI 消息
      (this as any)._sseController = api.askCoachStream({
        fen,
        moveHistory: this.properties.moveHistory,
        question,
        onChunk: (chunk: string) => {
          const messages = this.data.messages;
          const last = messages[messages.length - 1];
          if (last && last.role === 'assistant') {
            last.content += chunk;
            last.streaming = true;
            this.setData({ messages });
          }
        },
        onError: () => {
          const messages = this.data.messages;
          const last = messages[messages.length - 1];
          if (last && last.role === 'assistant') {
            last.content = last.content || '抱歉，暂时无法回答。请稍后再试。';
            last.streaming = false;
            this.setData({ messages, isLoading: false, isStreaming: false });
          }
        },
        onDone: () => {
          const messages = this.data.messages;
          const last = messages[messages.length - 1];
          if (last) last.streaming = false;
          this.setData({
            messages,
            isLoading: false,
            isStreaming: false,
          });
        },
      });
    },

    onSuggestionTap(e: any) {
      const text = e.currentTarget.dataset.text;
      this.setData({ inputValue: text });
      // 自动发送
      setTimeout(() => this.onSend(), 100);
    },

    onClear() {
      this.setData({ messages: [], unreadCount: 0 });
    },

    onStop() {
      if ((this as any)._sseController) {
        (this as any)._sseController.abort();
        (this as any)._sseController = null;
      }
      this.setData({ isLoading: false, isStreaming: false });
    },
  },
});

export {};