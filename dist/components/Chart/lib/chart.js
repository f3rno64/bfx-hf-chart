"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _isFunction2 = require("lodash/isFunction");
var _isFunction3 = _interopRequireDefault(_isFunction2);
var _isFinite2 = require("lodash/isFinite");
var _isFinite3 = _interopRequireDefault(_isFinite2);
var _isObject2 = require("lodash/isObject");
var _isObject3 = _interopRequireDefault(_isObject2);
var _isEmpty2 = require("lodash/isEmpty");
var _isEmpty3 = _interopRequireDefault(_isEmpty2);
var _last2 = require("lodash/last");
var _last3 = _interopRequireDefault(_last2);
var _max2 = require("lodash/max");
var _max3 = _interopRequireDefault(_max2);
var _min2 = require("lodash/min");
var _min3 = _interopRequireDefault(_min2);
var _bfxApiNodeModels = require("bfx-api-node-models");
var _bfxHfUtil = require("bfx-hf-util");
var _mouseWheel = require("mouse-wheel");
var _mouseWheel2 = _interopRequireDefault(_mouseWheel);
var _format_axis_tick = require("./util/format_axis_tick");
var _format_axis_tick2 = _interopRequireDefault(_format_axis_tick);
var _line = require("./draw/line");
var _line2 = _interopRequireDefault(_line);
var _data_transformer = require("./data_transformer");
var _data_transformer2 = _interopRequireDefault(_data_transformer);
var _transformed_line_from_data = require("./draw/transformed_line_from_data");
var _transformed_line_from_data2 = _interopRequireDefault(_transformed_line_from_data);
var _ohlc_series = require("./draw/ohlc_series");
var _ohlc_series2 = _interopRequireDefault(_ohlc_series);
var _x_axis = require("./draw/x_axis");
var _x_axis2 = _interopRequireDefault(_x_axis);
var _y_axis = require("./draw/y_axis");
var _y_axis2 = _interopRequireDefault(_y_axis);
var _config = require("./config");
var _config2 = _interopRequireDefault(_config);
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
class BitfinexTradingChart {
  constructor({
    ohlcCanvas,
    axisCanvas,
    drawingCanvas,
    indicatorCanvas,
    crosshairCanvas,
    width,
    height,
    trades = [],
    orders = [],
    position,
    data,
    dataWidth,
    dataKey,
    indicators = [],
    onLoadMoreCB,
    onHoveredCandleCB,
    onUpdateIndicatorSettingsCB,
    config = {}
  }) {
    Object.keys(config).forEach(key => {
      (0, _config.set)(key, config[key]);
    });
    this.ohlcCanvas = ohlcCanvas;
    this.axisCanvas = axisCanvas;
    this.drawingCanvas = drawingCanvas;
    this.indicatorCanvas = indicatorCanvas;
    this.crosshairCanvas = crosshairCanvas;
    this.width = width;
    this.height = height;
    this.trades = trades;
    this.orders = orders;
    this.position = position;
    this.dataWidth = _bfxHfUtil.TIME_FRAME_WIDTHS[dataWidth];
    this.onLoadMoreCB = onLoadMoreCB;
    this.onHoveredCandleCB = onHoveredCandleCB;
    this.onUpdateIndicatorSettingsCB = onUpdateIndicatorSettingsCB;
    this.viewportWidthCandles = 200;
    this.candleWidthPX = Math.max(1, 7 - Math.floor(this.viewportWidthCandles / 50));
    this.isDragging = false;
    this.dragStart = null;
    this.lastHoveredCandle = null;
    this.mousePosition = {
      x: 0,
      y: 0
    };
    this.vp = {
      pan: {
        x: 0,
        y: 0
      },
      origin: {
        x: 0,
        y: 0
      },
      size: {
        w: width - _config2.default.MARGIN_RIGHT - 0.5,
        h: height - _config2.default.MARGIN_BOTTOM - _config2.default.AXIS_MARGIN_BOTTOM - 0.5
      }
    };
    this.onMouseUp = this.onMouseUp.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseLeave = this.onMouseLeave.bind(this);
    this.onMouseWheel = this.onMouseWheel.bind(this);
    this.crosshairCanvas.addEventListener('mouseup', this.onMouseUp);
    this.crosshairCanvas.addEventListener('mousedown', this.onMouseDown);
    this.crosshairCanvas.addEventListener('mousemove', this.onMouseMove);
    this.crosshairCanvas.addEventListener('mouseleave', this.onMouseLeave);
    (0, _mouseWheel2.default)(this.crosshairCanvas, this.onMouseWheel);
    this.activeDrawing = null;
    this.drawings = [];
    this.externalIndicators = 0; // set in updateData()

    this.updateIndicators(indicators);
    this.updateData(data, dataWidth, dataKey);
    this.clipCanvases();
    this.clearAll();
    this.renderAll();
  }
  clipCanvases() {
    const drawingCTX = this.drawingCanvas.getContext('2d');
    const ohlcCTX = this.ohlcCanvas.getContext('2d');
    const vpHeight = this.getOHLCVPHeight();
    const clipRegion = new Path2D();
    clipRegion.rect(0, 0, this.vp.size.w, vpHeight);
    ohlcCTX.clip(clipRegion);
    drawingCTX.clip(clipRegion);
  }
  updateDrawings(drawings = []) {
    this.drawings = drawings;
    if (drawings[0] && drawings[0].isActive()) {
      this.activeDrawing = drawings[0];
    }
  }
  updateIndicators(indicators = []) {
    this.indicators = indicators;
    this.updateData(this.data);
    const ohlcHeight = this.getOHLCVPHeight();
    const slotHeight = this.externalIndicators === 0 ? 0 : (this.vp.size.h - ohlcHeight) / this.externalIndicators;
    if (this.onUpdateIndicatorSettingsCB) {
      this.onUpdateIndicatorSettingsCB(indicators, slotHeight);
    }
  }
  updateTrades(trades = []) {
    this.trades = trades;
    this.clearAll();
    this.renderAll();
  }
  updateOrders(orders = []) {
    this.orders = orders;
    this.clearAll();
    this.renderAll();
  }
  updatePosition(position) {
    this.position = position;
    this.clearAll();
    this.renderAll();
  }

  /**
   * Updates internal candle & indicator data sets
   *
   * @param {Array[]} data - candle dataset
   * @param {number?} dataWidth - candle width, default unchanged
   * @param {string} dataKey - optional, resets pan on change
   */
  updateData(data = [], dataWidth, dataKey) {
    if (dataWidth) {
      this.dataWidth = _bfxHfUtil.TIME_FRAME_WIDTHS[dataWidth];
    }
    if (this.dataKey && this.dataKey !== dataKey) {
      this.onDataReset();
    }
    this.data = data;
    this.dataKey = dataKey;
    this.indicatorData = [];
    this.externalIndicators = 0;
    const indicatorInstances = [];
    for (let i = 0; i < this.indicators.length; i += 1) {
      const ind = new this.indicators[i][0](this.indicators[i][1]);
      ind.colors = this.indicators[i][2];
      if (ind.ui.position === 'external') {
        this.externalIndicators += 1;
      }
      indicatorInstances.push([ind, this.indicators[i][0]]);
    }
    for (let i = 0; i < data.length; i += 1) {
      for (let j = 0; j < indicatorInstances.length; j += 1) {
        const ind = indicatorInstances[j][0];
        if (ind.getDataType() === 'trade') {
          continue;
        }
        const c = new _bfxApiNodeModels.Candle(data[i]);
        if (ind.getDataKey() === '*') {
          ind.add(c);
        } else {
          ind.add(c[ind.getDataKey()]);
        }
        if (!this.indicatorData[j]) {
          this.indicatorData[j] = [];
        }
        const v = ind.v();
        let nullP = 0;
        if (indicatorInstances[j][1].ui.lines) {
          nullP = {};
          indicatorInstances[j][1].ui.lines.forEach(key => nullP[key] = 0);
        }
        this.indicatorData[j].push((0, _isFinite3.default)(v) || (0, _isObject3.default)(v) ? v : nullP);
      }
    }
    this.clearAll();
    this.renderAll();
  }
  updateDimensions(width, height) {
    this.width = width;
    this.height = height;
    this.vp.size.w = width - _config2.default.MARGIN_RIGHT - 0.5;
    this.vp.size.h = height - _config2.default.MARGIN_BOTTOM - _config2.default.AXIS_MARGIN_BOTTOM - 0.5;
    if (this.onUpdateIndicatorSettingsCB) {
      const ohlcHeight = this.getOHLCVPHeight();
      const slotHeight = this.externalIndicators === 0 ? 0 : (this.vp.size.h - ohlcHeight) / this.externalIndicators;
      this.onUpdateIndicatorSettingsCB(this.indicators, slotHeight);
    }
    this.clipCanvases();
    this.clearAll();
    this.renderAll();
  }

  /**
   * Called when updated w/ data having a different dataKey. Resets pan
   */
  onDataReset() {
    this.vp.pan.x = 0;
    this.vp.pan.y = 0;
    this.vp.origin.x = 0;
    this.vp.origin.y = 0;
  }
  clearAll() {
    this.clear(this.ohlcCanvas);
    this.clear(this.axisCanvas);
    this.clear(this.drawingCanvas);
    this.clear(this.indicatorCanvas);
    this.clear(this.crosshairCanvas);
  }
  clear(canvas) {
    const ctx = canvas.getContext('2d');
    const {
      width,
      height
    } = this;
    ctx.clearRect(0, 0, width, height);
  }
  getCandlesInView() {
    const panX = this.vp.pan.x + this.vp.origin.x;
    const candlePanOffset = panX > 0 ? Math.floor(panX / this.candleWidthPX) : 0;
    const start = this.data.length - 1 - this.viewportWidthCandles - candlePanOffset;
    const end = this.data.length - 1 - candlePanOffset;
    if (end < 0) {
      return [];
    }
    return this.data.slice((0, _max3.default)([0, start]), end);
  }
  getIndicatorDataInView() {
    const panX = this.vp.pan.x + this.vp.origin.x;
    const candlePanOffset = panX > 0 ? Math.floor(panX / this.candleWidthPX) : 0;
    const dataInView = [];
    for (let i = 0; i < this.indicatorData.length; i += 1) {
      const start = this.indicatorData[i].length - 1 - this.viewportWidthCandles - candlePanOffset;
      const end = this.indicatorData[i].length - 1 - candlePanOffset;
      dataInView.push(this.indicatorData[i].slice((0, _max3.default)([0, start]), end));
    }
    return dataInView;
  }
  renderAll() {
    this.renderOHLC();
    this.renderHoveredOHLC();
    this.renderTrades();
    this.renderIndicators();
    this.renderAxis();
    this.renderDrawings();
    this.renderOrders();
    this.renderPosition();
  }
  renderIndicators() {
    if (this.data.length < 2) {
      return;
    }
    const indicatorData = this.getIndicatorDataInView();
    let currentExtSlot = 0;
    let currentOverlaySlot = 0;
    for (let i = 0; i < this.indicators.length; i += 1) {
      const indicator = this.indicators[i];
      const data = indicatorData[i];
      const iClass = indicator[0];
      const {
        ui
      } = iClass;
      const {
        position,
        type
      } = ui;
      if (data.length === 0) {
        continue;
      }
      if (position === 'external') {
        if (type === 'rsi') {
          this.renderRSIIndicator(indicator, data, currentExtSlot++);
        } else if (type === 'macd') {
          this.renderMACDIndicator(indicator, data, currentExtSlot++);
        } else if (type === 'line') {
          this.renderExternalLineIndicator(indicator, data, currentExtSlot++);
        } else if (type === 'lines') {
          this.renderExternalLinesIndicator(indicator, data, currentExtSlot++);
        }
      } else if (position === 'overlay') {
        if (type === 'line') {
          this.renderOverlayLineIndicator(indicator, data, currentOverlaySlot++);
        } else if (type === 'lines') {
          this.renderOverlayLinesIndicator(indicator, data, currentOverlaySlot++);
        } else if (type === 'bbands') {
          this.renderBBandsIndicator(indicator, data, currentOverlaySlot++);
        }
      }
    }
  }
  renderBBandsIndicator(indicator, data) {
    const candlesToRender = this.getCandlesInView();
    if ((0, _isEmpty3.default)(candlesToRender)) {
      return;
    }
    const colors = indicator[2];
    const vpHeight = this.getOHLCVPHeight();
    const rightMTS = (0, _last3.default)(candlesToRender)[0];
    const vWidth = this.viewportWidthCandles * this.dataWidth;
    const maxP = (0, _max3.default)(candlesToRender.map(ohlc => ohlc[3]));
    const minP = (0, _min3.default)(candlesToRender.map(ohlc => ohlc[4]));
    const pd = maxP - minP;
    const topLinePoints = [];
    const middleLinePoints = [];
    const bottomLinePoints = [];
    for (let i = 0; i < candlesToRender.length; i += 1) {
      const d = candlesToRender[i];
      const [mts] = d;
      const top = (data[i].top - minP) / pd * vpHeight;
      const middle = (data[i].middle - minP) / pd * vpHeight;
      const bottom = (data[i].bottom - minP) / pd * vpHeight;
      const x = (vWidth - (rightMTS - mts)) / vWidth * (this.vp.size.w - this.candleWidthPX / 2);
      topLinePoints.push({
        x,
        y: vpHeight - top
      });
      middleLinePoints.push({
        x,
        y: vpHeight - middle
      });
      bottomLinePoints.push({
        x,
        y: vpHeight - bottom
      });
    }
    (0, _line2.default)(this.ohlcCanvas, colors[0], topLinePoints);
    (0, _line2.default)(this.ohlcCanvas, colors[1], middleLinePoints);
    (0, _line2.default)(this.ohlcCanvas, colors[2], bottomLinePoints);
  }
  renderRSIIndicator(indicator, data, exSlot) {
    const candlesToRender = this.getCandlesInView();
    if ((0, _isEmpty3.default)(candlesToRender)) {
      return;
    }
    const color = indicator[2][0];
    const iInstance = new indicator[0](indicator[1]);
    const vpHeight = this.getOHLCVPHeight();
    const slotHeight = (this.vp.size.h - vpHeight) / this.externalIndicators;
    const slotY = vpHeight + slotHeight * exSlot + _config2.default.AXIS_MARGIN_BOTTOM;
    const rightMTS = (0, _last3.default)(candlesToRender)[0];
    const vWidth = this.viewportWidthCandles * this.dataWidth;
    const transformer = (0, _data_transformer2.default)(data, vWidth, rightMTS);
    (0, _transformed_line_from_data2.default)(this.indicatorCanvas, color, transformer, {
      yData: data,
      xData: candlesToRender.map(c => c[0]),
      ySize: slotHeight,
      xSize: this.vp.size.w - this.candleWidthPX / 2,
      yOffset: slotHeight + slotY,
      xOffset: 0
    });
    this.renderExternalSlotMeta(transformer, iInstance.getName(), [30, 70], exSlot);
  }
  renderMACDIndicator(indicator, data, exSlot) {
    const candlesToRender = this.getCandlesInView();
    if ((0, _isEmpty3.default)(candlesToRender)) {
      return;
    }
    const colors = indicator[2];
    const iInstance = new indicator[0](indicator[1]);
    const vpHeight = this.getOHLCVPHeight();
    const slotHeight = (this.vp.size.h - vpHeight) / this.externalIndicators;
    const slotY = vpHeight + slotHeight * exSlot + _config2.default.AXIS_MARGIN_BOTTOM;
    const rightMTS = (0, _last3.default)(candlesToRender)[0];
    const vWidth = this.viewportWidthCandles * this.dataWidth;
    const lineKeys = ['macd', 'signal'];
    lineKeys.forEach((lineKey, i) => {
      const color = colors[i];
      const lineData = data.map(p => p[lineKey]);
      const transformer = (0, _data_transformer2.default)(lineData, vWidth, rightMTS);
      (0, _transformed_line_from_data2.default)(this.indicatorCanvas, color, transformer, {
        yData: lineData,
        xData: candlesToRender.map(c => c[0]),
        ySize: slotHeight,
        xSize: this.vp.size.w - this.candleWidthPX / 2,
        yOffset: slotHeight + slotY,
        xOffset: 0
      });
      if (i === 0) {
        this.renderExternalSlotMeta(transformer, iInstance.getName(), [0], exSlot);
      }
    });
    const maxV = (0, _max3.default)(data.map(p => (0, _max3.default)([p.macd, p.signal])));
    const minV = (0, _min3.default)(data.map(p => (0, _min3.default)([p.macd, p.signal])));
    const divergenceTransformer = (0, _data_transformer2.default)([maxV, minV], vWidth, rightMTS);
    for (let i = 0; i < candlesToRender.length; i += 1) {
      const mts = candlesToRender[i][0];
      (0, _transformed_line_from_data2.default)(this.indicatorCanvas, colors[2], divergenceTransformer, {
        yData: [0, data[i].divergence],
        xData: [mts, mts],
        ySize: slotHeight,
        xSize: this.vp.size.w - this.candleWidthPX / 2,
        yOffset: slotHeight + slotY,
        xOffset: 0
      });
    }
  }
  renderExternalLineIndicator(indicator, data, exSlot) {
    const candlesToRender = this.getCandlesInView();
    if ((0, _isEmpty3.default)(candlesToRender)) {
      return;
    }
    const color = indicator[2][0];
    const iInstance = new indicator[0](indicator[1]);
    const vpHeight = this.getOHLCVPHeight();
    const slotHeight = (this.vp.size.h - vpHeight) / this.externalIndicators;
    const slotY = vpHeight + slotHeight * exSlot + _config2.default.AXIS_MARGIN_BOTTOM;
    const rightMTS = (0, _last3.default)(candlesToRender)[0];
    const vWidth = this.viewportWidthCandles * this.dataWidth;
    const transformer = (0, _data_transformer2.default)(data, vWidth, rightMTS);
    (0, _transformed_line_from_data2.default)(this.indicatorCanvas, color, transformer, {
      yData: data,
      xData: candlesToRender.map(c => c[0]),
      ySize: slotHeight,
      xSize: this.vp.size.w - this.candleWidthPX / 2,
      yOffset: slotY + slotHeight,
      xOffset: 0
    });
    this.renderExternalSlotMeta(transformer, iInstance.getName(), [0], exSlot);
  }
  renderExternalLinesIndicator(indicator, data, exSlot) {
    const candlesToRender = this.getCandlesInView();
    if ((0, _isEmpty3.default)(candlesToRender)) {
      return;
    }
    const colors = indicator[2];
    const iInstance = new indicator[0](indicator[1]);
    const vpHeight = this.getOHLCVPHeight();
    const slotHeight = (this.vp.size.h - vpHeight) / this.externalIndicators;
    const slotY = vpHeight + slotHeight * exSlot + _config2.default.AXIS_MARGIN_BOTTOM;
    const rightMTS = (0, _last3.default)(candlesToRender)[0];
    const vWidth = this.viewportWidthCandles * this.dataWidth;
    indicator[0].ui.lines.forEach((lineKey, i) => {
      const lineData = data.map(p => p[lineKey]);
      const transformer = (0, _data_transformer2.default)(lineData, vWidth, rightMTS);
      (0, _transformed_line_from_data2.default)(this.indicatorCanvas, colors[i], transformer, {
        yData: lineData,
        xData: candlesToRender.map(c => c[0]),
        ySize: slotHeight,
        xSize: this.vp.size.w - this.candleWidthPX / 2,
        yOffset: slotY + slotHeight,
        xOffset: 0
      });
      if (i === 0) {
        this.renderExternalSlotMeta(transformer, iInstance.getName(), [0], exSlot);
      }
    });
  }
  renderExternalSlotMeta(transformer, label, xAxes, exSlot) {
    const vpHeight = this.getOHLCVPHeight();
    const slotHeight = (this.vp.size.h - vpHeight) / this.externalIndicators;
    const slotY = vpHeight + slotHeight * exSlot + _config2.default.AXIS_MARGIN_BOTTOM;
    const ctx = this.indicatorCanvas.getContext('2d');
    for (let i = 0; i < xAxes.length; i += 1) {
      const axis = xAxes[i];
      const axisY = transformer.y(axis, slotHeight);
      this.drawHorizontalVPLine(this.indicatorCanvas, _config2.default.AXIS_COLOR, slotY + slotHeight - axisY);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.fillText((0, _format_axis_tick2.default)(axis), this.vp.size.w + 5, slotY + slotHeight - axisY + 3);
    }
  }
  renderOverlayLineIndicator(indicator, data) {
    const candlesToRender = this.getCandlesInView();
    if ((0, _isEmpty3.default)(candlesToRender)) {
      return;
    }
    const color = indicator[2][0];
    const vpHeight = this.getOHLCVPHeight();
    const rightMTS = (0, _last3.default)(candlesToRender)[0];
    const vWidth = this.viewportWidthCandles * this.dataWidth;
    const maxP = (0, _max3.default)(candlesToRender.map(ohlc => ohlc[3]));
    const minP = (0, _min3.default)(candlesToRender.map(ohlc => ohlc[4]));
    const pd = maxP - minP;
    const linePoints = [];
    for (let i = 0; i < candlesToRender.length; i += 1) {
      const d = candlesToRender[i];
      const [mts] = d;
      const y = (data[i] - minP) / pd * vpHeight;
      const x = (vWidth - (rightMTS - mts)) / vWidth * (this.vp.size.w - this.candleWidthPX / 2);
      linePoints.push({
        x,
        y: vpHeight - y
      });
    }
    (0, _line2.default)(this.ohlcCanvas, color, linePoints);
  }
  renderOverlayLinesIndicator(indicator, data) {
    const candlesToRender = this.getCandlesInView();
    if ((0, _isEmpty3.default)(candlesToRender)) {
      return;
    }
    const colors = indicator[2];
    const vpHeight = this.getOHLCVPHeight();
    const rightMTS = (0, _last3.default)(candlesToRender)[0];
    const vWidth = this.viewportWidthCandles * this.dataWidth;
    const maxP = (0, _max3.default)(candlesToRender.map(ohlc => ohlc[3]));
    const minP = (0, _min3.default)(candlesToRender.map(ohlc => ohlc[4]));
    const pd = maxP - minP;
    for (let i = 0; i < indicator[0].ui.lines.length; i += 1) {
      const lineKey = indicator[0].ui.lines[i];
      const linePoints = [];
      for (let j = 0; j < candlesToRender.length; j += 1) {
        const d = candlesToRender[j];
        const [mts] = d;
        const y = (data[j][lineKey] - minP) / pd * vpHeight;
        const x = (vWidth - (rightMTS - mts)) / vWidth * (this.vp.size.w - this.candleWidthPX / 2);
        linePoints.push({
          x,
          y: vpHeight - y
        });
      }
      (0, _line2.default)(this.ohlcCanvas, colors[i], linePoints);
    }
  }

  /**
   * Renders the crosshair and updates the toolbar OHLC stats
   */
  renderCrosshair() {
    const {
      width,
      height,
      mousePosition
    } = this;
    (0, _line2.default)(this.crosshairCanvas, _config2.default.CROSSHAIR_COLOR, [{
      x: 0,
      y: mousePosition.y + 0.5
    }, {
      x: width,
      y: mousePosition.y + 0.5
    }]);
    (0, _line2.default)(this.crosshairCanvas, _config2.default.CROSSHAIR_COLOR, [{
      x: mousePosition.x + 0.5,
      y: 0
    }, {
      x: mousePosition.x + 0.5,
      y: height
    }]);
    const ctx = this.crosshairCanvas.getContext('2d');
    const candlesInView = this.getCandlesInView();
    if (candlesInView.length === 0) {
      return;
    }
    const maxP = (0, _max3.default)(candlesInView.map(ohlc => ohlc[3]));
    const minP = (0, _min3.default)(candlesInView.map(ohlc => ohlc[4]));
    const rightMTS = (0, _last3.default)(candlesInView)[0];
    const leftMTS = candlesInView[0][0];
    const mtsPerPX = (rightMTS - leftMTS) / this.vp.size.w;
    const pricePerPX = (maxP - minP) / this.getOHLCVPHeight();
    const mouseMTS = Math.floor(leftMTS + mtsPerPX * mousePosition.x);
    const mousePrice = maxP - pricePerPX * mousePosition.y;
    const labelX = new Date(mouseMTS).toLocaleString();
    const labelY = (0, _format_axis_tick2.default)(mousePrice);
    const labelXWidth = ctx.measureText(labelX).width;
    const labelYWidth = ctx.measureText(labelY).width;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ccc';
    ctx.fillRect(mousePosition.x - labelXWidth / 2, height - 17, labelXWidth, 14);
    ctx.fillStyle = '#000';
    ctx.fillText(labelX, mousePosition.x, height - 5);
    if (mousePosition.y <= this.getOHLCVPHeight()) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ccc';
      ctx.fillRect(this.vp.size.w, mousePosition.y, labelYWidth, 14);
      ctx.fillStyle = '#000';
      ctx.fillText(labelY, this.vp.size.w, mousePosition.y + 12);
    }

    // Find nearest candle
    const candleDistances = candlesInView.map((c, i) => [Math.abs(c[0] - mouseMTS), i]);
    candleDistances.sort((a, b) => a[0] - b[0]);
    const lastHoveredCandle = candlesInView[candleDistances[0][1]];
    this.lastHoveredCandle = lastHoveredCandle;
    if (this.onHoveredCandleCB) {
      this.onHoveredCandleCB(lastHoveredCandle);
    }
  }
  renderDrawings() {
    for (let i = 0; i < this.drawings.length; i += 1) {
      this.drawings[i].render();
    }
  }
  renderOrders() {
    if (this.data.length < 2) {
      return;
    }
    const candles = this.getCandlesInView();
    const maxP = (0, _max3.default)(candles.map(ohlc => ohlc[3]));
    const minP = (0, _min3.default)(candles.map(ohlc => ohlc[4]));
    const visibleOrders = this.orders.filter(({
      price
    }) => price >= minP && price <= maxP);
    if (visibleOrders.length === 0) {
      return;
    }
    const ctx = this.drawingCanvas.getContext('2d');
    const transformer = this.getOHLCTransformer();
    visibleOrders.forEach(o => {
      const color = o.amount < 0 ? _config2.default.FALLING_CANDLE_FILL : _config2.default.RISING_CANDLE_FILL;
      const label = `${(0, _format_axis_tick2.default)(o.amount)} @ ${(0, _format_axis_tick2.default)(o.price)}`;
      const labelWidth = ctx.measureText(label).width;
      const y = transformer.y(o.price);
      const labelX = this.vp.size.w - _config2.default.MARGIN_RIGHT * 0.5 - labelWidth;
      (0, _line2.default)(this.drawingCanvas, color, [{
        x: 0,
        y
      }, {
        x: this.vp.size.w,
        y
      }], true);
      ctx.font = `${_config2.default.AXIS_LABEL_FONT_SIZE_PX} ${_config2.default.AXIS_LABEL_FONT_NAME}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = color;
      ctx.fillRect(labelX, y - 8, labelWidth + 16, 16);
      ctx.fillStyle = '#000';
      ctx.fillText(label, labelX + 8, y + 4);
    });
  }
  renderPosition() {
    if (this.data.length < 2 || !this.position) {
      return;
    }
    const candles = this.getCandlesInView();
    const maxP = (0, _max3.default)(candles.map(ohlc => ohlc[3]));
    const minP = (0, _min3.default)(candles.map(ohlc => ohlc[4]));
    const {
      basePrice,
      amount
    } = this.position;
    if (basePrice < minP || basePrice > maxP) {
      return;
    }
    const ctx = this.drawingCanvas.getContext('2d');
    const transformer = this.getOHLCTransformer();
    const color = amount < 0 ? _config2.default.FALLING_CANDLE_FILL : _config2.default.RISING_CANDLE_FILL;
    const label = `${(0, _format_axis_tick2.default)(amount)} @ ${(0, _format_axis_tick2.default)(basePrice)}`;
    const labelWidth = ctx.measureText(label).width;
    const y = transformer.y(basePrice);
    const labelX = this.vp.size.w - _config2.default.MARGIN_RIGHT * 0.5 - labelWidth;
    (0, _line2.default)(this.drawingCanvas, color, [{
      x: 0,
      y
    }, {
      x: this.vp.size.w,
      y
    }]);
    ctx.font = `${_config2.default.AXIS_LABEL_FONT_SIZE_PX} ${_config2.default.AXIS_LABEL_FONT_NAME}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    ctx.fillRect(labelX, y - 8, labelWidth + 16, 16);
    ctx.fillStyle = '#000';
    ctx.fillText(label, labelX + 8, y + 4);
  }
  getMTSForRawX(x) {
    const candlesInView = this.getCandlesInView();
    const rightMTS = (0, _last3.default)(candlesInView)[0];
    const leftMTS = candlesInView[0][0];
    const mtsPerPX = (rightMTS - leftMTS) / this.vp.size.w;
    return leftMTS + mtsPerPX * x;
  }
  getPriceForRawY(y) {
    const candlesInView = this.getCandlesInView();
    const vpHeight = this.getOHLCVPHeight();
    const high = (0, _max3.default)(candlesInView.map(c => c[3]));
    const low = (0, _min3.default)(candlesInView.map(c => c[4]));
    const pricePerPX = (high - low) / vpHeight;
    return high - pricePerPX * y;
  }
  getOHLCTransformer() {
    const candlesToRender = this.getCandlesInView();
    if ((0, _isEmpty3.default)(candlesToRender)) {
      return;
    }
    const vpHeight = this.getOHLCVPHeight();
    const rightMTS = (0, _last3.default)(candlesToRender)[0];
    const vWidth = this.viewportWidthCandles * this.dataWidth;
    const maxP = (0, _max3.default)(candlesToRender.map(ohlc => ohlc[3]));
    const minP = (0, _min3.default)(candlesToRender.map(ohlc => ohlc[4]));
    const transformer = (0, _data_transformer2.default)([maxP, minP], vWidth, rightMTS);
    transformer.setTargetWidth(this.vp.size.w);
    transformer.setTargetHeight(vpHeight);
    transformer.setYModifier(y => vpHeight - y);
    return transformer;
  }
  drawHorizontalVPLine(canvas, color, y) {
    (0, _line2.default)(canvas, color, [{
      x: 0,
      y
    }, {
      x: this.vp.size.w,
      y
    }]);
  }
  renderAxis() {
    const candles = this.getCandlesInView();
    if (candles.length === 0) {
      return;
    }
    const vpWidth = this.viewportWidthCandles * this.dataWidth;
    const vpHeight = this.getOHLCVPHeight();
    (0, _x_axis2.default)(this.axisCanvas, candles, vpHeight, vpWidth, this.vp.size.w);
    (0, _y_axis2.default)(this.axisCanvas, candles, this.vp.size.w, this.height, vpHeight);
  }
  getOHLCVPHeight() {
    return this.vp.size.h - (0, _min3.default)([this.vp.size.h / 2, this.externalIndicators * 100]);
  }
  renderHoveredOHLC() {
    if (!this.lastHoveredCandle) {
      return;
    }
    const ctx = this.crosshairCanvas.getContext('2d');
    let x = _config2.default.OHLC_LABEL_POSITION_X;
    let y = _config2.default.OHLC_LABEL_POSITION_Y;
    ctx.font = `${_config2.default.OHLC_LABEL_FONT_SIZE_PX} ${_config2.default.OHLC_LABEL_FONT_NAME}`;
    ctx.textAlign = 'left';
    const o = (0, _format_axis_tick2.default)(this.lastHoveredCandle[1]);
    const h = (0, _format_axis_tick2.default)(this.lastHoveredCandle[3]);
    const l = (0, _format_axis_tick2.default)(this.lastHoveredCandle[4]);
    const c = (0, _format_axis_tick2.default)(this.lastHoveredCandle[2]);
    const oWidth = ctx.measureText('O:').width;
    const hWidth = ctx.measureText('H:').width;
    const lWidth = ctx.measureText('L:').width;
    const cWidth = ctx.measureText('C:').width;
    const oVWidth = ctx.measureText(o).width;
    const hVWidth = ctx.measureText(h).width;
    const lVWidth = ctx.measureText(l).width;
    ctx.fillStyle = _config2.default.OHLC_LABEL_COLOR;
    ctx.fillText('O:', x, y);
    ctx.fillStyle = _config2.default.OHLC_LABEL_VALUE_COLOR;
    ctx.fillText(o, x + oWidth + _config2.default.OHLC_LABEL_SPACING, y);
    x = x + oWidth + _config2.default.OHLC_LABEL_SPACING * 2 + oVWidth;
    ctx.fillStyle = _config2.default.OHLC_LABEL_COLOR;
    ctx.fillText('H:', x, y);
    ctx.fillStyle = _config2.default.OHLC_LABEL_VALUE_COLOR;
    ctx.fillText(h, x + hWidth + _config2.default.OHLC_LABEL_SPACING, y);
    x = x + hWidth + _config2.default.OHLC_LABEL_SPACING * 2 + hVWidth;
    ctx.fillStyle = _config2.default.OHLC_LABEL_COLOR;
    ctx.fillText('L:', x, y);
    ctx.fillStyle = _config2.default.OHLC_LABEL_VALUE_COLOR;
    ctx.fillText(l, x + lWidth + _config2.default.OHLC_LABEL_SPACING, y);
    x = x + lWidth + _config2.default.OHLC_LABEL_SPACING * 2 + lVWidth;
    ctx.fillStyle = _config2.default.OHLC_LABEL_COLOR;
    ctx.fillText('C:', x, y);
    ctx.fillStyle = _config2.default.OHLC_LABEL_VALUE_COLOR;
    ctx.fillText(c, x + cWidth + _config2.default.OHLC_LABEL_SPACING, y);
  }
  renderOHLC() {
    const ctx = this.ohlcCanvas.getContext('2d');
    const candles = this.getCandlesInView();
    if (candles.length === 0) {
      return;
    }
    const vpHeight = this.getOHLCVPHeight();
    const vpWidth = this.viewportWidthCandles * this.dataWidth;
    (0, _ohlc_series2.default)(ctx, candles, this.candleWidthPX, vpWidth, vpHeight, this.vp.size.w);
  }
  renderTrades() {
    if (this.data.length === 0 || this.trades.length === 0) {
      return;
    }
    const ctx = this.ohlcCanvas.getContext('2d');
    const transformer = this.getOHLCTransformer();
    for (let i = 0; i < this.trades.length; i += 1) {
      ctx.strokeStyle = this.trades[i].amount > 0 ? _config2.default.TRADE_MARKER_BUY_COLOR : _config2.default.TRADE_MARKER_SELL_COLOR;
      ctx.beginPath();
      ctx.arc(transformer.x(this.trades[i].mts), transformer.y(this.trades[i].price), _config2.default.TRADE_MARKER_RADIUS_PX, 0, 2 * Math.PI);
      ctx.stroke();
    }
  }
  getOHLCMousePosition() {
    return {
      mts: this.getMTSForRawX(this.mousePosition.x),
      price: this.getPriceForRawY(this.mousePosition.y)
    };
  }
  onMouseLeave() {
    this.clear(this.crosshairCanvas);
    this.isDragging = false;
  }
  onMouseUp() {
    this.isDragging = false;
    this.dragStart = null;
    this.vp.origin.x += this.vp.pan.x;
    this.vp.origin.y += this.vp.pan.y;
    this.vp.pan.x = 0;
    this.vp.pan.y = 0;
    if (this.activeDrawing) {
      this.activeDrawing.onMouseUp();
    }
  }
  onMouseDown(e) {
    const rect = this.ohlcCanvas.getBoundingClientRect();
    const x = e.pageX - rect.left;
    const y = e.pageY - rect.top;

    // Drawings can prevent drag-start (i.e. when editing)
    if (this.activeDrawing) {
      if (this.activeDrawing.onMouseDown(x, y)) {
        return;
      }
    }
    this.isDragging = true;
    this.dragStart = {
      x,
      y
    };
  }
  onMouseMove(e) {
    const rect = e.target.getBoundingClientRect();
    this.mousePosition = {
      x: e.pageX - rect.left,
      y: e.pageY - rect.top
    };
    if (this.activeDrawing) {
      this.activeDrawing.onMouseMove(this.mousePosition.x, this.mousePosition.y);
    }
    this.crosshairCanvas.style.cursor = this.activeDrawing && this.activeDrawing.isActive() ? 'crosshair' : 'default';
    if (this.isDragging && (!this.activeDrawing || !this.activeDrawing.isActive())) {
      this.vp.pan.x = this.mousePosition.x - this.dragStart.x;
      this.clearAll();
      this.renderAll();
      if ((0, _isFunction3.default)(this.onLoadMoreCB)) {
        const panX = this.vp.pan.x + this.vp.origin.x;
        const candlePanOffset = panX > 0 ? Math.floor(panX / this.candleWidthPX) : 0;
        if (candlePanOffset + this.viewportWidthCandles > this.data.length) {
          const newOnLoadMoreKey = `${(this.data[0] ?? [])[0]}-${((0, _last3.default)(this.data) ?? [])[0]}-${this.dataKey}`;
          if (this.onLoadMoreKey !== newOnLoadMoreKey) {
            this.onLoadMoreCB(this.viewportWidthCandles);
            this.onLoadMoreKey = newOnLoadMoreKey;
          }
        }
      }
    } else {
      this.clear(this.crosshairCanvas, 'rgba(0, 0, 0, 0)');
      this.clear(this.drawingCanvas, 'rgba(0, 0, 0, 0)');
      this.renderCrosshair();
      this.renderDrawings();
      this.renderOrders();
      this.renderPosition();
      this.renderHoveredOHLC();
    }
  }
  onMouseWheel(dx, dy, dz, ev) {
    // differing values in Chrome/FF, normalize
    const delta = dy < 0 ? -_config2.default.ZOOM_CANDLE_STEP : _config2.default.ZOOM_CANDLE_STEP;
    this.viewportWidthCandles += delta;
    if (this.viewportWidthCandles < _config2.default.ZOOM_MIN_LIMIT_CANDLES) {
      this.viewportWidthCandles = _config2.default.ZOOM_MIN_LIMIT_CANDLES;
    }
    this.candleWidthPX = Math.max(1, 7 - Math.floor(this.viewportWidthCandles / 50));
    this.clearAll();
    this.renderAll();
    ev.preventDefault();
    ev.stopPropagation();
  }
}
exports.default = BitfinexTradingChart;