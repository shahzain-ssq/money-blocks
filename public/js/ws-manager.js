export class WebSocketManager {
  constructor(institutionId, wsUrl) {
    if (WebSocketManager.instance) {
      return WebSocketManager.instance;
    }
    this.institutionId = institutionId;
    this.wsUrl = wsUrl;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectDelay = 5000;
    this.listeners = [];
    this.statusListeners = [];
    this.isConnected = false;
    this.shouldReconnect = true;

    WebSocketManager.instance = this;
    this.connect();
  }

  static getInstance(institutionId, wsUrl) {
    if (
      WebSocketManager.instance &&
      (String(WebSocketManager.instance.institutionId) !== String(institutionId) || WebSocketManager.instance.wsUrl !== wsUrl)
    ) {
      WebSocketManager.instance.close();
    }
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager(institutionId, wsUrl);
    }
    return WebSocketManager.instance;
  }

  connect() {
    if (!this.shouldReconnect) {
      return;
    }
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    // Construct URL with institution_id
    const url = new URL(this.wsUrl);
    url.searchParams.set('institution_id', this.institutionId);

    this.updateStatus('connecting');

    this.ws = new WebSocket(url.toString());

    this.ws.onopen = () => {
      console.log('WS Connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.updateStatus('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.notifyListeners(data);
      } catch (e) {
        console.error('WS Parse Error', e);
      }
    };

    this.ws.onclose = () => {
      console.log('WS Disconnected');
      this.isConnected = false;
      this.updateStatus('disconnected');
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (error) => {
      console.warn('WS Error', error);
      // onerror usually precedes onclose, so we let onclose handle reconnection
    };
  }

  scheduleReconnect() {
    const delay = Math.min(500 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    console.log(`Reconnecting in ${delay}ms...`);
    this.reconnectAttempts++;
    this.updateStatus('reconnecting');
    setTimeout(() => this.connect(), delay);
  }

  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  onStatusChange(callback) {
      this.statusListeners.push(callback);
      // Immediately notify current status
      callback(this.isConnected ? 'connected' : 'disconnected');
  }

  notifyListeners(data) {
    this.listeners.forEach(cb => cb(data));
  }

  updateStatus(status) {
      this.statusListeners.forEach(cb => cb(status));
  }

  close() {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.updateStatus('disconnected');
    WebSocketManager.instance = null;
  }
}
