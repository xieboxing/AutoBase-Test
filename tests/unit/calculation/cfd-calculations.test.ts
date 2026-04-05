/**
 * CFD 计算模块单元测试
 * 测试所有公开方法的计算准确性和错误处理
 */

import { describe, it, expect } from 'vitest';
import {
  CFD,
  CFDProductType,
  TradeDirection,
  DEFAULT_CONTRACT_SIZES,
  DEFAULT_LEVERAGES,
  type CFDParams,
} from '@/calculation/cfd-calculations.js';

describe('CFDCalculations', () => {
  // ============================================================================
  // 保证金计算测试
  // ============================================================================

  describe('calculateRequiredMargin', () => {
    it('should calculate forex margin correctly (EUR/USD BUY)', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 0.03,
        contractSize: 100000,
        leverage: 50,
        openPrice: 1.17910,
        baseCurrencyToUsdRate: 1.17910,
      };

      const result = CFD.calculateRequiredMargin(params);

      // 外汇保证金 = 手数 × 合约单位 / 杠杆 × 基础货币兑美元汇率
      // = 0.03 × 100000 / 50 × 1.17910 = 70.746
      expect(result.margin).toBeCloseTo(70.75, 1);
      expect(result.productType).toBe(CFDProductType.FOREX);
      expect(result.formula).toContain('0.03');
      expect(result.formula).toContain('100000');
      expect(result.formula).toContain('50');
    });

    it('should calculate forex margin with USD base currency (rate = 1)', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 1,
        contractSize: 100000,
        leverage: 100,
        openPrice: 143.88,
        baseCurrencyToUsdRate: 1, // USD 是基础货币
      };

      const result = CFD.calculateRequiredMargin(params);

      // = 1 × 100000 / 100 × 1 = 1000
      expect(result.margin).toBe(1000);
    });

    it('should calculate commodity margin correctly (Gold/XAUUSD)', () => {
      const params: CFDParams = {
        productType: CFDProductType.COMMODITY,
        direction: TradeDirection.BUY,
        lotSize: 0.05,
        contractSize: 100,
        leverage: 100,
        openPrice: 4825.61,
        quoteCurrencyToUsdRate: 1, // USD 计价
      };

      const result = CFD.calculateRequiredMargin(params);

      // 商品保证金 = 手数 × 价格 × 合约单位 × 计价币兑美元汇率 / 杠杆
      // = 0.05 × 4825.61 × 100 × 1 / 100 = 241.2805
      expect(result.margin).toBeCloseTo(241.28, 1);
      expect(result.productType).toBe(CFDProductType.COMMODITY);
    });

    it('should calculate index margin correctly (HK50)', () => {
      const params: CFDParams = {
        productType: CFDProductType.INDEX,
        direction: TradeDirection.BUY,
        lotSize: 1,
        contractSize: 10, // HK50 合约单位通常是 10
        leverage: 100,
        openPrice: 18000,
        quoteCurrencyToUsdRate: 0.13, // HKD 兑 USD 汇率约 0.13
      };

      const result = CFD.calculateRequiredMargin(params);

      // = 1 × 18000 × 10 × 0.13 / 100 = 234
      expect(result.margin).toBeCloseTo(234, 0);
    });

    it('should calculate stock margin correctly', () => {
      const params: CFDParams = {
        productType: CFDProductType.STOCK,
        direction: TradeDirection.BUY,
        lotSize: 10,
        contractSize: 1,
        leverage: 10,
        openPrice: 150, // AAPL 价格
        quoteCurrencyToUsdRate: 1,
      };

      const result = CFD.calculateRequiredMargin(params);

      // = 10 × 150 × 1 × 1 / 10 = 150
      expect(result.margin).toBe(150);
    });

    it('should calculate crypto margin correctly (BTCUSD)', () => {
      const params: CFDParams = {
        productType: CFDProductType.CRYPTO,
        direction: TradeDirection.BUY,
        lotSize: 0.1,
        contractSize: 1,
        leverage: 20,
        openPrice: 76000,
        quoteCurrencyToUsdRate: 1,
      };

      const result = CFD.calculateRequiredMargin(params);

      // = 0.1 × 76000 × 1 × 1 / 20 = 380
      expect(result.margin).toBe(380);
    });

    it('should throw error when leverage is missing', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 1,
        contractSize: 100000,
        openPrice: 1.18,
      };

      expect(() => CFD.calculateRequiredMargin(params)).toThrow('leverage（杠杆倍数）');
    });

    it('should throw error when openPrice is missing for non-forex', () => {
      const params: CFDParams = {
        productType: CFDProductType.COMMODITY,
        direction: TradeDirection.BUY,
        lotSize: 1,
        contractSize: 100,
        leverage: 100,
      };

      expect(() => CFD.calculateRequiredMargin(params)).toThrow('openPrice（开仓价格）');
    });

    it('should use default exchange rate when not provided', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 1,
        contractSize: 100000,
        leverage: 100,
        // 不提供 baseCurrencyToUsdRate，应该默认为 1
      };

      const result = CFD.calculateRequiredMargin(params);

      // = 1 × 100000 / 100 × 1 = 1000
      expect(result.margin).toBe(1000);
    });
  });

  // ============================================================================
  // 浮动盈亏计算测试
  // ============================================================================

  describe('calculateFloatingPnL', () => {
    it('should calculate floating PnL for BUY direction correctly', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 2,
        contractSize: 100000,
        openPrice: 1.2088,
        currentAskPrice: 1.3048, // 使用 Ask 价格作为卖出价
        quoteCurrencyToUsdRate: 1,
      };

      const result = CFD.calculateFloatingPnL(params);

      // 买入浮动盈亏 = (当前卖出价 - 开仓价) × 手数 × 合约单位 × 汇率
      // = (1.3048 - 1.2088) × 2 × 100000 × 1 = 19200
      expect(result.pnl).toBe(19200);
      expect(result.direction).toBe(TradeDirection.BUY);
    });

    it('should calculate floating PnL for SELL direction correctly', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.SELL,
        lotSize: 1,
        contractSize: 100000,
        openPrice: 143.88,
        currentBidPrice: 142.08,
        quoteCurrencyToUsdRate: 0.0064, // JPY 兑 USD
      };

      const result = CFD.calculateFloatingPnL(params);

      // 卖出浮动盈亏 = (开仓价 - 当前买入价) × 手数 × 合约单位 × 汇率
      // = (143.88 - 142.08) × 1 × 100000 × 0.0064 = 1152
      expect(result.pnl).toBeCloseTo(1152, 0);
      expect(result.direction).toBe(TradeDirection.SELL);
    });

    it('should return negative PnL when price moves against position', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        openPrice: 1.2088,
        lotSize: 1,
        contractSize: 100000,
        currentAskPrice: 1.1088, // 价格下跌
        quoteCurrencyToUsdRate: 1,
      };

      const result = CFD.calculateFloatingPnL(params);

      // = (1.1088 - 1.2088) × 1 × 100000 × 1 = -10000
      expect(result.pnl).toBe(-10000);
    });

    it('should throw error when openPrice is missing', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 1,
        contractSize: 100000,
        currentAskPrice: 1.2,
      };

      expect(() => CFD.calculateFloatingPnL(params)).toThrow('openPrice（开仓价格）');
    });

    it('should use currentBidPrice as fallback for ASK in BUY direction', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 1,
        contractSize: 100000,
        openPrice: 1.2,
        currentBidPrice: 1.25, // 只提供 Bid，Ask 未提供
        quoteCurrencyToUsdRate: 1,
      };

      const result = CFD.calculateFloatingPnL(params);

      // 使用 Bid 作为卖出价
      expect(result.pnl).toBe(5000);
    });
  });

  // ============================================================================
  // 平仓盈亏计算测试
  // ============================================================================

  describe('calculateClosedPnL', () => {
    it('should calculate closed PnL for BUY direction', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 2,
        contractSize: 100000,
        openPrice: 1.2088,
        closePrice: 1.3048,
        quoteCurrencyToUsdRate: 1,
      };

      const result = CFD.calculateClosedPnL(params);

      // 买入平仓盈亏 = (平仓价 - 开仓价) × 手数 × 合约单位 × 汇率
      // = (1.3048 - 1.2088) × 2 × 100000 × 1 = 19200
      expect(result.pnl).toBe(19200);
      expect(result.direction).toBe(TradeDirection.BUY);
    });

    it('should calculate closed PnL for SELL direction', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.SELL,
        lotSize: 1,
        contractSize: 100000,
        openPrice: 150,
        closePrice: 140,
        quoteCurrencyToUsdRate: 1,
      };

      const result = CFD.calculateClosedPnL(params);

      // 卖出平仓盈亏 = (开仓价 - 平仓价) × 手数 × 合约单位 × 汇率
      // = (150 - 140) × 1 × 100000 × 1 = 1000000
      expect(result.pnl).toBe(1000000);
    });

    it('should throw error when closePrice is missing', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 1,
        contractSize: 100000,
        openPrice: 1.2,
      };

      expect(() => CFD.calculateClosedPnL(params)).toThrow('closePrice（平仓价格）');
    });

    it('should throw error when openPrice is missing', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 1,
        contractSize: 100000,
        closePrice: 1.3,
      };

      expect(() => CFD.calculateClosedPnL(params)).toThrow('openPrice（开仓价格）');
    });
  });

  // ============================================================================
  // 预计盈亏计算测试
  // ============================================================================

  describe('calculateExpectedPnL', () => {
    it('should calculate expected PnL for BUY direction (take profit)', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 2,
        contractSize: 100000,
        openPrice: 1.2088,
        inputPrice: 1.3048, // 止盈价格
        quoteCurrencyToUsdRate: 1,
      };

      const result = CFD.calculateExpectedPnL(params);

      expect(result.pnl).toBe(19200);
      expect(result.direction).toBe(TradeDirection.BUY);
    });

    it('should calculate expected PnL for SELL direction (stop loss)', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.SELL,
        lotSize: 1,
        contractSize: 100000,
        openPrice: 150,
        inputPrice: 155, // 止损价格（价格上涨）
        quoteCurrencyToUsdRate: 1,
      };

      const result = CFD.calculateExpectedPnL(params);

      // 卖出预计盈亏 = (开仓价 - 输入价格) × 手数 × 合约单位 × 汇率
      // = (150 - 155) × 1 × 100000 × 1 = -500000 (亏损)
      expect(result.pnl).toBe(-500000);
    });

    it('should throw error when inputPrice is missing', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 1,
        contractSize: 100000,
        openPrice: 1.2,
      };

      expect(() => CFD.calculateExpectedPnL(params)).toThrow('inputPrice（输入价格）');
    });
  });

  // ============================================================================
  // 点差计算测试
  // ============================================================================

  describe('calculateSpread', () => {
    it('should calculate spread correctly', () => {
      const spread = CFD.calculateSpread(1.15353, 1.15359);

      // 点差 = Ask - Bid = 1.15359 - 1.15353 = 0.00006
      expect(spread).toBeCloseTo(0.00006, 5);
    });

    it('should return positive spread when Ask > Bid', () => {
      const spread = CFD.calculateSpread(100, 101);

      expect(spread).toBe(1);
    });
  });

  describe('calculateSpreadCost', () => {
    it('should calculate spread cost for BUY direction', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 1,
        contractSize: 100000,
        openPrice: 1.15356,
        spreadBidPrice: 1.15353,
        spreadAskPrice: 1.15359,
        quoteCurrencyToUsdRate: 1,
      };

      const result = CFD.calculateSpreadCost(params);

      // 买入点差成本 = (开仓时刻卖出价 - 开仓价) × 手数 × 合约单位 × 汇率
      // 假设开仓价是 Ask 价格，点差成本应该很小
      expect(result.pnl).toBeDefined();
      expect(result.direction).toBe(TradeDirection.BUY);
    });

    it('should calculate spread cost for SELL direction', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.SELL,
        lotSize: 1,
        contractSize: 100000,
        openPrice: 1.15353, // 卖出时用 Bid 价格开仓
        spreadBidPrice: 1.15353,
        spreadAskPrice: 1.15359,
        quoteCurrencyToUsdRate: 1,
      };

      const result = CFD.calculateSpreadCost(params);

      expect(result.pnl).toBeDefined();
      expect(result.direction).toBe(TradeDirection.SELL);
    });

    it('should throw error when openPrice is missing', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 1,
        contractSize: 100000,
      };

      expect(() => CFD.calculateSpreadCost(params)).toThrow('openPrice（开仓价格）');
    });
  });

  // ============================================================================
  // 隔夜利息计算测试
  // ============================================================================

  describe('calculateSwap', () => {
    it('should calculate swap for FOREX (EUR/USD BUY)', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 0.03,
        contractSize: 100000,
        closePriceForSwap: 1.1790,
        buySwapRate: -0.01152, // 负值表示需要支付（-0.01152%）
        quoteCurrencyToUsdRate: 1,
      };

      const result = CFD.calculateSwap(params);

      // 外汇隔夜利息 = 手数 × 合约单位 × 收盘价 × 隔夜费百分比/100 × 汇率
      // = 0.03 × 100000 × 1.1790 × (-0.01152/100) × 1
      // = 3537 × (-0.0001152) = -0.407
      expect(result.swapAmount).toBeCloseTo(-0.41, 1);
      expect(result.swapRate).toBe(-0.01152);
    });

    it('should calculate swap for CRYPTO (BTCUSD BUY)', () => {
      const params: CFDParams = {
        productType: CFDProductType.CRYPTO,
        direction: TradeDirection.BUY,
        lotSize: 0.25,
        contractSize: 1,
        leverage: 20,
        closePriceForSwap: 76163.18,
        buySwapRate: -0.065,
        quoteCurrencyToUsdRate: 1,
      };

      const result = CFD.calculateSwap(params);

      // 加密货币隔夜利息 = 手数 × 合约单位 × 收盘价 × 隔夜费百分比 × (杠杆-1)/杠杆 × 汇率
      // = 0.25 × 1 × 76163.18 × (-0.065/100) × (20-1)/20 × 1
      // = 0.25 × 1 × 76163.18 × (-0.00065) × 0.95 × 1 = -11.7577
      expect(result.swapAmount).toBeCloseTo(-11.76, 1);
    });

    it('should use sellSwapRate for SELL direction', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.SELL,
        lotSize: 0.03,
        contractSize: 100000,
        closePriceForSwap: 1.1790,
        sellSwapRate: 0.00847, // 正值表示获得
        quoteCurrencyToUsdRate: 1,
      };

      const result = CFD.calculateSwap(params);

      // 使用 sellSwapRate
      expect(result.swapRate).toBe(0.00847);
      expect(result.swapAmount).toBeGreaterThan(0); // 正值表示获得
    });

    it('should throw error when closePriceForSwap is missing', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 1,
        contractSize: 100000,
        buySwapRate: -0.01,
      };

      expect(() => CFD.calculateSwap(params)).toThrow('closePriceForSwap（收盘价）');
    });

    it('should use 0 as default swap rate when not provided', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 1,
        contractSize: 100000,
        closePriceForSwap: 1.18,
        // 不提供 swap rate
      };

      const result = CFD.calculateSwap(params);

      expect(result.swapRate).toBe(0);
      expect(result.swapAmount).toBe(0);
    });
  });

  // ============================================================================
  // 账户指标计算测试
  // ============================================================================

  describe('calculateMarginLevel', () => {
    it('should calculate margin level correctly', () => {
      const result = CFD.calculateMarginLevel(10000, 5000);

      // 保证金水平 = 净值 / 占用保证金 × 100%
      // = 10000 / 5000 × 100% = 200%
      expect(result.value).toBe(200);
      expect(result.formula).toContain('200');
    });

    it('should return 0 when totalUsedMargin is 0', () => {
      const result = CFD.calculateMarginLevel(10000, 0);

      expect(result.value).toBe(0);
      expect(result.formula).toContain('无占用保证金');
    });

    it('should return less than 100% when equity is low', () => {
      const result = CFD.calculateMarginLevel(3000, 5000);

      // = 3000 / 5000 × 100% = 60%
      expect(result.value).toBe(60);
    });
  });

  describe('calculateEquity', () => {
    it('should calculate equity correctly', () => {
      const result = CFD.calculateEquity(10000, 1000, 500, 200);

      // 净值 = 入金 - 出金 + 总平仓净盈亏 + 总浮动净盈亏
      // = 10000 - 1000 + 500 + 200 = 9700
      expect(result.value).toBe(9700);
    });

    it('should handle zero values', () => {
      const result = CFD.calculateEquity(0, 0, 0, 0);

      expect(result.value).toBe(0);
    });

    it('should handle negative closed PnL', () => {
      const result = CFD.calculateEquity(10000, 0, -500, 100);

      // = 10000 - 0 + (-500) + 100 = 9600
      expect(result.value).toBe(9600);
    });
  });

  describe('calculateBalance', () => {
    it('should calculate balance correctly', () => {
      const result = CFD.calculateBalance(10000, 1000, 500);

      // 余额 = 入金 - 出金 + 总平仓净盈亏
      // = 10000 - 1000 + 500 = 9500
      expect(result.value).toBe(9500);
    });

    it('should not include floating PnL', () => {
      // Balance 不包含浮动盈亏，只包含已平仓的盈亏
      const result = CFD.calculateBalance(10000, 0, 500);

      expect(result.value).toBe(10500);
    });
  });

  describe('calculateAvailableBalance', () => {
    it('should calculate available balance correctly', () => {
      const result = CFD.calculateAvailableBalance(10000, 5000);

      // 可用余额 = 净值 - 占用保证金
      // = 10000 - 5000 = 5000
      expect(result.value).toBe(5000);
    });

    it('should return negative when margin exceeds equity', () => {
      const result = CFD.calculateAvailableBalance(3000, 5000);

      // = 3000 - 5000 = -2000 (爆仓风险)
      expect(result.value).toBe(-2000);
    });
  });

  describe('calculateTotalFloatingNetPnL', () => {
    it('should calculate total floating net PnL', () => {
      const result = CFD.calculateTotalFloatingNetPnL(1000, -50);

      // 总浮动净盈亏 = 总浮动盈亏 + 总隔夜费
      // = 1000 + (-50) = 950
      expect(result.value).toBe(950);
    });
  });

  describe('calculateTotalClosedNetPnL', () => {
    it('should calculate total closed net PnL', () => {
      const result = CFD.calculateTotalClosedNetPnL(500, -20);

      // 总平仓净盈亏 = 总平仓盈亏 + 总平仓隔夜费
      // = 500 + (-20) = 480
      expect(result.value).toBe(480);
    });
  });

  // ============================================================================
  // 爆仓价格计算测试
  // ============================================================================

  describe('calculateLiquidationPrice', () => {
    it('should calculate liquidation price for BUY position', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 1,
        contractSize: 100000,
        openPrice: 1.2,
        quoteCurrencyToUsdRate: 1,
      };
      const margin = 1000; // 保证金

      const result = CFD.calculateLiquidationPrice(params, margin);

      // 买入爆仓价格 = 开仓价 - (保证金 × 汇率 / (手数 × 合约单位))
      // = 1.2 - (1000 × 1 / (1 × 100000)) = 1.2 - 0.01 = 1.19
      expect(result).toBeCloseTo(1.19, 4);
    });

    it('should calculate liquidation price for SELL position', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.SELL,
        lotSize: 1,
        contractSize: 100000,
        openPrice: 1.2,
        quoteCurrencyToUsdRate: 1,
      };
      const margin = 1000;

      const result = CFD.calculateLiquidationPrice(params, margin);

      // 卖出爆仓价格 = 开仓价 + (保证金 × 汇率 / (手数 × 合约单位))
      // = 1.2 + 0.01 = 1.21
      expect(result).toBeCloseTo(1.21, 4);
    });

    it('should throw error when openPrice is missing', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 1,
        contractSize: 100000,
      };
      const margin = 1000;

      expect(() => CFD.calculateLiquidationPrice(params, margin)).toThrow('openPrice（开仓价格）');
    });
  });

  // ============================================================================
  // 产品类型识别测试
  // ============================================================================

  describe('detectProductType', () => {
    it('should detect FOREX from currency pairs', () => {
      expect(CFD.detectProductType('EURUSD')).toBe(CFDProductType.FOREX);
      expect(CFD.detectProductType('GBPUSD')).toBe(CFDProductType.FOREX);
      expect(CFD.detectProductType('USDJPY')).toBe(CFDProductType.FOREX);
      expect(CFD.detectProductType('AUDNZD')).toBe(CFDProductType.FOREX);
    });

    it('should detect COMMODITY from gold/silver codes', () => {
      expect(CFD.detectProductType('XAUUSD')).toBe(CFDProductType.COMMODITY);
      expect(CFD.detectProductType('XAGUSD')).toBe(CFDProductType.COMMODITY);
      expect(CFD.detectProductType('XPTUSD')).toBe(CFDProductType.COMMODITY);
    });

    it('should detect INDEX from index codes', () => {
      expect(CFD.detectProductType('HK50')).toBe(CFDProductType.INDEX);
      expect(CFD.detectProductType('US500')).toBe(CFDProductType.INDEX);
      expect(CFD.detectProductType('NAS100')).toBe(CFDProductType.INDEX);
      expect(CFD.detectProductType('JP225')).toBe(CFDProductType.INDEX);
    });

    it('should detect CRYPTO from crypto codes', () => {
      expect(CFD.detectProductType('BTCUSD')).toBe(CFDProductType.CRYPTO);
      expect(CFD.detectProductType('ETHUSD')).toBe(CFDProductType.CRYPTO);
      expect(CFD.detectProductType('LTCUSD')).toBe(CFDProductType.CRYPTO);
    });

    it('should return STOCK for unknown short codes', () => {
      expect(CFD.detectProductType('AAPL')).toBe(CFDProductType.STOCK);
      expect(CFD.detectProductType('TSLA')).toBe(CFDProductType.STOCK);
      expect(CFD.detectProductType('MSFT')).toBe(CFDProductType.STOCK);
    });

    it('should handle lowercase input', () => {
      expect(CFD.detectProductType('eurusd')).toBe(CFDProductType.FOREX);
      expect(CFD.detectProductType('btcusd')).toBe(CFDProductType.CRYPTO);
    });
  });

  // ============================================================================
  // 默认配置测试
  // ============================================================================

  describe('getDefaultContractSize', () => {
    it('should return correct default contract sizes', () => {
      expect(CFD.getDefaultContractSize(CFDProductType.FOREX)).toBe(100000);
      expect(CFD.getDefaultContractSize(CFDProductType.COMMODITY)).toBe(100);
      expect(CFD.getDefaultContractSize(CFDProductType.INDEX)).toBe(1);
      expect(CFD.getDefaultContractSize(CFDProductType.STOCK)).toBe(1);
      expect(CFD.getDefaultContractSize(CFDProductType.CRYPTO)).toBe(1);
    });
  });

  describe('getDefaultLeverage', () => {
    it('should return correct default leverages', () => {
      expect(CFD.getDefaultLeverage(CFDProductType.FOREX)).toBe(100);
      expect(CFD.getDefaultLeverage(CFDProductType.COMMODITY)).toBe(100);
      expect(CFD.getDefaultLeverage(CFDProductType.INDEX)).toBe(100);
      expect(CFD.getDefaultLeverage(CFDProductType.STOCK)).toBe(10);
      expect(CFD.getDefaultLeverage(CFDProductType.CRYPTO)).toBe(20);
    });
  });

  // ============================================================================
  // 常量测试
  // ============================================================================

  describe('DEFAULT_CONTRACT_SIZES', () => {
    it('should have all product types defined', () => {
      expect(DEFAULT_CONTRACT_SIZES[CFDProductType.FOREX]).toBeDefined();
      expect(DEFAULT_CONTRACT_SIZES[CFDProductType.COMMODITY]).toBeDefined();
      expect(DEFAULT_CONTRACT_SIZES[CFDProductType.INDEX]).toBeDefined();
      expect(DEFAULT_CONTRACT_SIZES[CFDProductType.STOCK]).toBeDefined();
      expect(DEFAULT_CONTRACT_SIZES[CFDProductType.CRYPTO]).toBeDefined();
    });
  });

  describe('DEFAULT_LEVERAGES', () => {
    it('should have all product types defined', () => {
      expect(DEFAULT_LEVERAGES[CFDProductType.FOREX]).toBeDefined();
      expect(DEFAULT_LEVERAGES[CFDProductType.COMMODITY]).toBeDefined();
      expect(DEFAULT_LEVERAGES[CFDProductType.INDEX]).toBeDefined();
      expect(DEFAULT_LEVERAGES[CFDProductType.STOCK]).toBeDefined();
      expect(DEFAULT_LEVERAGES[CFDProductType.CRYPTO]).toBeDefined();
    });
  });

  // ============================================================================
  // 总占用保证金计算测试
  // ============================================================================

  describe('calculateTotalUsedMargin', () => {
    it('should calculate total margin for multiple positions', () => {
      const positions: CFDParams[] = [
        {
          productType: CFDProductType.FOREX,
          direction: TradeDirection.BUY,
          lotSize: 0.03,
          contractSize: 100000,
          leverage: 50,
          openPrice: 1.17910,
          baseCurrencyToUsdRate: 1.17910,
        },
        {
          productType: CFDProductType.COMMODITY,
          direction: TradeDirection.BUY,
          lotSize: 0.05,
          contractSize: 100,
          leverage: 100,
          openPrice: 4825.61,
          quoteCurrencyToUsdRate: 1,
        },
      ];

      const totalMargin = CFD.calculateTotalUsedMargin(positions);

      // EUR/USD: ~70.75, Gold: ~241.28, Total: ~312.03
      expect(totalMargin).toBeCloseTo(312, 0);
    });

    it('should return 0 for empty positions array', () => {
      const totalMargin = CFD.calculateTotalUsedMargin([]);

      expect(totalMargin).toBe(0);
    });

    it('should handle single position', () => {
      const positions: CFDParams[] = [
        {
          productType: CFDProductType.FOREX,
          direction: TradeDirection.BUY,
          lotSize: 1,
          contractSize: 100000,
          leverage: 100,
        },
      ];

      const totalMargin = CFD.calculateTotalUsedMargin(positions);

      expect(totalMargin).toBe(1000);
    });
  });

  // ============================================================================
  // 边界情况测试
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle very small lot sizes', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 0.01,
        contractSize: 100000,
        leverage: 100,
      };

      const result = CFD.calculateRequiredMargin(params);

      // = 0.01 × 100000 / 100 = 10
      expect(result.margin).toBe(10);
    });

    it('should handle very large lot sizes', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 100,
        contractSize: 100000,
        leverage: 100,
      };

      const result = CFD.calculateRequiredMargin(params);

      // = 100 × 100000 / 100 = 100000
      expect(result.margin).toBe(100000);
    });

    it('should handle high leverage', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 1,
        contractSize: 100000,
        leverage: 500, // 高杠杆
      };

      const result = CFD.calculateRequiredMargin(params);

      // = 1 × 100000 / 500 = 200
      expect(result.margin).toBe(200);
    });

    it('should handle low leverage', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 1,
        contractSize: 100000,
        leverage: 10, // 低杠杆
      };

      const result = CFD.calculateRequiredMargin(params);

      // = 1 × 100000 / 10 = 10000
      expect(result.margin).toBe(10000);
    });

    it('should handle zero lot size (edge case)', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 0,
        contractSize: 100000,
        leverage: 100,
      };

      const result = CFD.calculateRequiredMargin(params);

      // 0 手的保证金应该是 0
      expect(result.margin).toBe(0);
    });
  });

  // ============================================================================
  // 公式输出测试
  // ============================================================================

  describe('Formula Output', () => {
    it('should include all calculation parameters in formula', () => {
      const params: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 1,
        contractSize: 100000,
        leverage: 100,
        baseCurrencyToUsdRate: 1.18,
      };

      const result = CFD.calculateRequiredMargin(params);

      expect(result.formula).toContain('1'); // lotSize
      expect(result.formula).toContain('100000'); // contractSize
      expect(result.formula).toContain('100'); // leverage
      expect(result.formula).toContain('1.18'); // exchangeRate
      expect(result.formula).toContain('USD');
    });

    it('should indicate formula type for different products', () => {
      const forexParams: CFDParams = {
        productType: CFDProductType.FOREX,
        direction: TradeDirection.BUY,
        lotSize: 1,
        contractSize: 100000,
        leverage: 100,
      };

      const commodityParams: CFDParams = {
        productType: CFDProductType.COMMODITY,
        direction: TradeDirection.BUY,
        lotSize: 1,
        contractSize: 100,
        leverage: 100,
        openPrice: 4000,
      };

      const forexResult = CFD.calculateRequiredMargin(forexParams);
      const commodityResult = CFD.calculateRequiredMargin(commodityParams);

      expect(forexResult.formula).toContain('外汇公式');
      expect(commodityResult.formula).toContain('COMMODITY');
    });
  });
});