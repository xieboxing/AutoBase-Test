export enum CFDProductType {
  FOREX = 'FOREX',
  COMMODITY = 'COMMODITY',
  INDEX = 'INDEX',
  STOCK = 'STOCK',
  CRYPTO = 'CRYPTO'
}

export enum TradeDirection {
  BUY = 'BUY',
  SELL = 'SELL'
}

export interface CFDParams {
  productType: CFDProductType;
  direction: TradeDirection;
  lotSize: number;
  contractSize: number;
  leverage?: number;
  openPrice?: number;
  currentBidPrice?: number;
  currentAskPrice?: number;
  closePrice?: number;
  inputPrice?: number;
  baseCurrencyToUsdRate?: number;
  quoteCurrencyToUsdRate?: number;
  buySwapRate?: number;
  sellSwapRate?: number;
  closePriceForSwap?: number;
  deposit?: number;
  withdrawal?: number;
  totalUsedMargin?: number;
  totalFloatingPnL?: number;
  totalSwapFee?: number;
  totalClosedPnL?: number;
  totalClosedSwapFee?: number;
  spreadBidPrice?: number;
  spreadAskPrice?: number;
}

export interface MarginResult {
  margin: number;
  formula: string;
  productType: CFDProductType;
}

export interface PnLResult {
  pnl: number;
  formula: string;
  direction: TradeDirection;
}

export interface SwapResult {
  swapAmount: number;
  formula: string;
  swapRate: number;
}

export interface AccountResult {
  value: number;
  formula: string;
}

export const DEFAULT_CONTRACT_SIZES: Record<CFDProductType, number> = {
  [CFDProductType.FOREX]: 100000,
  [CFDProductType.COMMODITY]: 100,
  [CFDProductType.INDEX]: 1,
  [CFDProductType.STOCK]: 1,
  [CFDProductType.CRYPTO]: 1
};

export const DEFAULT_LEVERAGES: Record<CFDProductType, number> = {
  [CFDProductType.FOREX]: 100,
  [CFDProductType.COMMODITY]: 100,
  [CFDProductType.INDEX]: 100,
  [CFDProductType.STOCK]: 10,
  [CFDProductType.CRYPTO]: 20
};

const PERCENTAGE_DIVISOR = 100;

// 内部辅助函数
function getMarginExchangeRate(params: CFDParams): number {
  const { productType, baseCurrencyToUsdRate } = params;

  if (productType === CFDProductType.FOREX) {
    return baseCurrencyToUsdRate ?? 1;
  }

  return params.quoteCurrencyToUsdRate ?? 1;
}

function getPnLExchangeRate(params: CFDParams): number {
  return params.quoteCurrencyToUsdRate ?? 1;
}

function roundTo(value: number, decimals: number = 2): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

// 导出的公共函数
export function calculateRequiredMargin(params: CFDParams): MarginResult {
  const {
    productType,
    lotSize,
    contractSize,
    leverage,
    openPrice
  } = params;

  if (leverage === undefined || leverage === null) {
    throw new Error('保证金计算需要提供 leverage（杠杆倍数）参数');
  }

  let margin: number;
  let formula: string;

  if (productType === CFDProductType.FOREX) {
    const exchangeRate = getMarginExchangeRate(params);
    margin = (lotSize * contractSize / leverage) * exchangeRate;
    formula = `保证金 = ${lotSize} × ${contractSize} ÷ ${leverage} × ${exchangeRate} = ${roundTo(margin)} USD (外汇公式)`;
  } else {
    if (openPrice === undefined || openPrice === null) {
      throw new Error('非外汇保证金计算需要提供 openPrice（开仓价格）参数');
    }
    const exchangeRate = params.quoteCurrencyToUsdRate ?? 1;
    margin = (lotSize * openPrice * contractSize * exchangeRate) / leverage;
    formula = `保证金 = ${lotSize} × ${openPrice} × ${contractSize} × ${exchangeRate} ÷ ${leverage} = ${roundTo(margin)} USD (${productType}公式)`;
  }

  return {
    margin: roundTo(margin),
    formula,
    productType
  };
}

export function calculateTotalUsedMargin(positions: CFDParams[]): number {
  return positions.reduce((total, params) => {
    return total + calculateRequiredMargin(params).margin;
  }, 0);
}

export function calculateFloatingPnL(params: CFDParams): PnLResult {
  const {
    direction,
    lotSize,
    contractSize,
    openPrice,
    currentBidPrice,
    currentAskPrice
  } = params;

  if (openPrice === undefined || openPrice === null) {
    throw new Error('浮动盈亏计算需要提供 openPrice（开仓价格）参数');
  }

  const exchangeRate = getPnLExchangeRate(params);
  let pnl: number;
  let formula: string;

  if (direction === TradeDirection.BUY) {
    const sellPrice = currentAskPrice ?? currentBidPrice ?? 0;
    pnl = (sellPrice - openPrice) * lotSize * contractSize * exchangeRate;
    formula = `浮动盈亏 = (${sellPrice} - ${openPrice}) × ${lotSize} × ${contractSize} × ${exchangeRate} = ${roundTo(pnl)} USD (买入)`;
  } else {
    const buyPrice = currentBidPrice ?? currentAskPrice ?? 0;
    pnl = (openPrice - buyPrice) * lotSize * contractSize * exchangeRate;
    formula = `浮动盈亏 = (${openPrice} - ${buyPrice}) × ${lotSize} × ${contractSize} × ${exchangeRate} = ${roundTo(pnl)} USD (卖出)`;
  }

  return {
    pnl: roundTo(pnl),
    formula,
    direction
  };
}

export function calculateClosedPnL(params: CFDParams): PnLResult {
  const {
    direction,
    lotSize,
    contractSize,
    openPrice,
    closePrice
  } = params;

  if (closePrice === undefined || closePrice === null) {
    throw new Error('平仓盈亏计算需要提供 closePrice（平仓价格）参数');
  }

  if (openPrice === undefined || openPrice === null) {
    throw new Error('平仓盈亏计算需要提供 openPrice（开仓价格）参数');
  }

  const exchangeRate = getPnLExchangeRate(params);
  let pnl: number;
  let formula: string;

  if (direction === TradeDirection.BUY) {
    pnl = (closePrice - openPrice) * lotSize * contractSize * exchangeRate;
    formula = `平仓盈亏 = (${closePrice} - ${openPrice}) × ${lotSize} × ${contractSize} × ${exchangeRate} = ${roundTo(pnl)} USD (买入)`;
  } else {
    pnl = (openPrice - closePrice) * lotSize * contractSize * exchangeRate;
    formula = `平仓盈亏 = (${openPrice} - ${closePrice}) × ${lotSize} × ${contractSize} × ${exchangeRate} = ${roundTo(pnl)} USD (卖出)`;
  }

  return {
    pnl: roundTo(pnl),
    formula,
    direction
  };
}

export function calculateExpectedPnL(params: CFDParams): PnLResult {
  const {
    direction,
    lotSize,
    contractSize,
    openPrice,
    inputPrice
  } = params;

  if (inputPrice === undefined || inputPrice === null) {
    throw new Error('预计盈亏计算需要提供 inputPrice（输入价格）参数');
  }

  if (openPrice === undefined || openPrice === null) {
    throw new Error('预计盈亏计算需要提供 openPrice（开仓价格）参数');
  }

  const exchangeRate = getPnLExchangeRate(params);
  let pnl: number;
  let formula: string;

  if (direction === TradeDirection.BUY) {
    pnl = (inputPrice - openPrice) * lotSize * contractSize * exchangeRate;
    formula = `预计盈亏 = (${inputPrice} - ${openPrice}) × ${lotSize} × ${contractSize} × ${exchangeRate} = ${roundTo(pnl)} USD (买入)`;
  } else {
    pnl = (openPrice - inputPrice) * lotSize * contractSize * exchangeRate;
    formula = `预计盈亏 = (${openPrice} - ${inputPrice}) × ${lotSize} × ${contractSize} × ${exchangeRate} = ${roundTo(pnl)} USD (卖出)`;
  }

  return {
    pnl: roundTo(pnl),
    formula,
    direction
  };
}

export function calculateSpread(bidPrice: number, askPrice: number): number {
  return askPrice - bidPrice;
}

export function calculateSpreadCost(params: CFDParams): PnLResult {
  const {
    direction,
    lotSize,
    contractSize,
    openPrice,
    spreadBidPrice,
    spreadAskPrice
  } = params;

  if (openPrice === undefined || openPrice === null) {
    throw new Error('点差成本计算需要提供 openPrice（开仓价格）参数');
  }

  const exchangeRate = getPnLExchangeRate(params);
  let cost: number;
  let formula: string;

  if (direction === TradeDirection.BUY) {
    const sellPrice = spreadAskPrice ?? openPrice;
    cost = (sellPrice - openPrice) * lotSize * contractSize * exchangeRate;
    formula = `点差成本 = (${sellPrice} - ${openPrice}) × ${lotSize} × ${contractSize} × ${exchangeRate} = ${roundTo(cost)} USD (买入)`;
  } else {
    const buyPrice = spreadBidPrice ?? openPrice;
    cost = (openPrice - buyPrice) * lotSize * contractSize * exchangeRate;
    formula = `点差成本 = (${openPrice} - ${buyPrice}) × ${lotSize} × ${contractSize} × ${exchangeRate} = ${roundTo(cost)} USD (卖出)`;
  }

  return {
    pnl: roundTo(cost),
    formula,
    direction
  };
}

export function calculateSwap(params: CFDParams): SwapResult {
  const {
    productType,
    direction,
    lotSize,
    contractSize,
    leverage,
    closePriceForSwap,
    buySwapRate,
    sellSwapRate
  } = params;

  if (closePriceForSwap === undefined || closePriceForSwap === null) {
    throw new Error('隔夜利息计算需要提供 closePriceForSwap（收盘价）参数');
  }

  const swapRate = direction === TradeDirection.BUY
    ? (buySwapRate ?? 0)
    : (sellSwapRate ?? 0);

  const exchangeRate = getPnLExchangeRate(params);
  const swapRateDecimal = swapRate / PERCENTAGE_DIVISOR;

  let swapAmount: number;
  let formula: string;

  if (productType === CFDProductType.FOREX ||
      productType === CFDProductType.COMMODITY ||
      productType === CFDProductType.INDEX) {
    swapAmount = lotSize * contractSize * closePriceForSwap * swapRateDecimal * exchangeRate;
    formula = `隔夜利息 = ${lotSize} × ${contractSize} × ${closePriceForSwap} × ${swapRate}% × ${exchangeRate} = ${roundTo(swapAmount)} USD (${productType})`;
  } else {
    const leverageFactor = (leverage! - 1) / leverage!;
    swapAmount = lotSize * contractSize * closePriceForSwap * swapRateDecimal * leverageFactor * exchangeRate;
    formula = `隔夜利息 = ${lotSize} × ${contractSize} × ${closePriceForSwap} × ${swapRate}% × (${leverage!}-1)/${leverage!} × ${exchangeRate} = ${roundTo(swapAmount)} USD (${productType})`;
  }

  return {
    swapAmount: roundTo(swapAmount),
    formula,
    swapRate
  };
}

export function calculateMarginLevel(equity: number, totalUsedMargin: number): AccountResult {
  if (totalUsedMargin === 0) {
    return {
      value: 0,
      formula: '保证金水平 = 0% (无占用保证金)'
    };
  }

  const marginLevel = (equity / totalUsedMargin) * 100;

  return {
    value: roundTo(marginLevel),
    formula: `保证金水平 = ${equity} / ${totalUsedMargin} × 100% = ${roundTo(marginLevel)}%`
  };
}

export function calculateEquity(
  deposit: number,
  withdrawal: number,
  totalClosedNetPnL: number,
  totalFloatingNetPnL: number
): AccountResult {
  const equity = deposit - withdrawal + totalClosedNetPnL + totalFloatingNetPnL;

  return {
    value: roundTo(equity),
    formula: `净值 = ${deposit} - ${withdrawal} + ${totalClosedNetPnL} + ${totalFloatingNetPnL} = ${roundTo(equity)}`
  };
}

export function calculateBalance(
  deposit: number,
  withdrawal: number,
  totalClosedNetPnL: number
): AccountResult {
  const balance = deposit - withdrawal + totalClosedNetPnL;

  return {
    value: roundTo(balance),
    formula: `余额 = ${deposit} - ${withdrawal} + ${totalClosedNetPnL} = ${roundTo(balance)}`
  };
}

export function calculateAvailableBalance(equity: number, totalUsedMargin: number): AccountResult {
  const availableBalance = equity - totalUsedMargin;

  return {
    value: roundTo(availableBalance),
    formula: `可用余额 = ${equity} - ${totalUsedMargin} = ${roundTo(availableBalance)}`
  };
}

export function calculateTotalFloatingNetPnL(
  totalFloatingPnL: number,
  totalSwapFee: number
): AccountResult {
  const netPnL = totalFloatingPnL + totalSwapFee;

  return {
    value: roundTo(netPnL),
    formula: `总浮动净盈亏 = ${totalFloatingPnL} + ${totalSwapFee} = ${roundTo(netPnL)}`
  };
}

export function calculateTotalClosedNetPnL(
  totalClosedPnL: number,
  totalClosedSwapFee: number
): AccountResult {
  const netPnL = totalClosedPnL + totalClosedSwapFee;

  return {
    value: roundTo(netPnL),
    formula: `总平仓净盈亏 = ${totalClosedPnL} + ${totalClosedSwapFee} = ${roundTo(netPnL)}`
  };
}

export function calculateLiquidationPrice(params: CFDParams, margin: number): number {
  const {
    direction,
    lotSize,
    contractSize,
    openPrice
  } = params;

  if (openPrice === undefined || openPrice === null) {
    throw new Error('爆仓价格计算需要提供 openPrice（开仓价格）参数');
  }

  const exchangeRate = getPnLExchangeRate(params);
  const priceChange = (margin * exchangeRate) / (lotSize * contractSize);

  let liquidationPrice: number;

  if (direction === TradeDirection.BUY) {
    liquidationPrice = openPrice - priceChange;
  } else {
    liquidationPrice = openPrice + priceChange;
  }

  return roundTo(liquidationPrice);
}

export function detectProductType(symbol: string): CFDProductType {
  const upperSymbol = symbol.toUpperCase();

  const cryptoPatterns = ['BTC', 'ETH', 'LTC', 'XRP', 'DOGE', 'ADA', 'SOL', 'BNB'];
  if (cryptoPatterns.some(crypto => upperSymbol.includes(crypto))) {
    return CFDProductType.CRYPTO;
  }

  const commodityPatterns = ['XAU', 'XAG', 'XPT', 'XPD', 'XTI', 'XBR'];
  if (commodityPatterns.some(commodity => upperSymbol.startsWith(commodity))) {
    return CFDProductType.COMMODITY;
  }

  const indexPatterns = ['HK50', 'JP225', 'US30', 'US500', 'NAS100', 'UK100', 'GER40', 'AUS200', 'ESP35', 'FRA40'];
  if (indexPatterns.some(index => upperSymbol.includes(index))) {
    return CFDProductType.INDEX;
  }

  const forexPatterns = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'NZD', 'CAD'];
  const forexPairs = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'NZDUSD', 'USDCAD', 'EURGBP', 'EURJPY', 'GBPJPY'];
  if (forexPairs.some(pair => upperSymbol === pair) ||
      (upperSymbol.length === 6 && forexPatterns.some(currency => upperSymbol.includes(currency)))) {
    return CFDProductType.FOREX;
  }

  return CFDProductType.STOCK;
}

export function getDefaultContractSize(productType: CFDProductType): number {
  return DEFAULT_CONTRACT_SIZES[productType];
}

export function getDefaultLeverage(productType: CFDProductType): number {
  return DEFAULT_LEVERAGES[productType];
}

// 兼容原有 API: CFD.methodName() 形式调用
export const CFD = {
  calculateRequiredMargin,
  calculateTotalUsedMargin,
  calculateFloatingPnL,
  calculateClosedPnL,
  calculateExpectedPnL,
  calculateSpread,
  calculateSpreadCost,
  calculateSwap,
  calculateMarginLevel,
  calculateEquity,
  calculateBalance,
  calculateAvailableBalance,
  calculateTotalFloatingNetPnL,
  calculateTotalClosedNetPnL,
  calculateLiquidationPrice,
  detectProductType,
  getDefaultContractSize,
  getDefaultLeverage,
};

export default CFD;