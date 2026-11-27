/* 媒合與合規檢查。評分權重沿用 11/14 MVP，並加上危品門檻、混載與黃牌限制。 */
(function (global) {
  const {
    CITIES, VEHICLE_META, FOOD_LIKE, CHEM_LIKE, DG_LIMITS_KG
  } = global.HTData;

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  function haversine(a, b) {
    const toRad = v => v * Math.PI / 180;
    const R = 6371;
    const [lat1, lon1] = CITIES[a];
    const [lat2, lon2] = CITIES[b];
    if (lat1 == null || lat2 == null) return 0;
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const q = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
  }

  function roadDistance(a, b) {
    if (!CITIES[a] || !CITIES[b]) return 0;
    return Math.round(haversine(a, b) * 1.27);
  }

  function dayDiff(a, b) {
    const toUTC = (s) => {
      const [y, m, d] = String(s).split('-').map(Number);
      return Date.UTC(y, (m || 1) - 1, d || 1);
    };
    return Math.round((toUTC(b) - toUTC(a)) / 86400000);
  }

  /**
   * 危險物品數量檢查。
   * 非危品：放行。
   * 危品：氣體 50kg、液體 100kg、固體 200kg；超過則 v1 擋下。
   */
  function assessDangerousGoods(cargo) {
    const isDg = !!(cargo.isDangerous || cargo.goodsType === '危險物品');
    if (!isDg) {
      return { allowed: true, regulated: false, code: 'not_dg' };
    }
    const state = cargo.physicalState;
    const limit = DG_LIMITS_KG[state];
    const weight = Number(cargo.weight) || 0;
    if (!limit) {
      return {
        allowed: false,
        regulated: true,
        code: 'missing_state',
        reason: '屬危險物品時，必須選擇型態（氣體／液體／固體），才能依門檻檢查。'
      };
    }
    if (weight > limit) {
      return {
        allowed: false,
        regulated: true,
        code: 'over_limit',
        limit,
        weight,
        physicalState: state,
        reason: `危險物品（${state}）重量 ${weight} kg，已超過第一版可承接的 ${limit} kg 門檻（道路交通安全規則第 84 條之數量例外）。此筆在 v1 不刊登、不媒合。`
      };
    }
    return {
      allowed: true,
      regulated: true,
      underThreshold: true,
      code: 'under_limit',
      limit,
      weight,
      physicalState: state,
      warning: `此筆屬危險物品，但 ${state} ${weight} kg 未超過 ${limit} kg 門檻。第一版仍建議改走專責運送，並備妥 SDS。`
    };
  }

  function hasYellowPlate(truck) {
    return (truck.licences || []).some(l => l.includes('營業貨車') || l.includes('黃牌'));
  }

  function goodsCompatible(cargo, truck) {
    const accepted = truck.acceptedGoods || [];
    if (accepted.length && cargo.goodsType && !accepted.includes(cargo.goodsType) && cargo.goodsType !== '其他常溫貨') {
      return { ok: false, reason: `此車行不承接「${cargo.goodsType}」。` };
    }
    const cargoIsFood = FOOD_LIKE.includes(cargo.goodsType);
    const cargoIsChem = CHEM_LIKE.includes(cargo.goodsType) || cargo.isDangerous;
    const last = truck.lastGoodsType || '';
    const lastIsChem = CHEM_LIKE.includes(last) || last === '危險物品';
    const lastIsFood = FOOD_LIKE.includes(last);
    const needsIsolation = (cargo.specialReqs || []).includes('不可與食品或藥用混載') || cargoIsChem;
    if (cargoIsFood && lastIsChem && truck.cleaned !== true) {
      return { ok: false, reason: '前一趟為化工貨且車廂尚未確認清潔，不可改載食品添加物或藥用原料。' };
    }
    if (needsIsolation && lastIsFood && truck.cleaned !== true) {
      return { ok: false, reason: '前一趟為食品或藥用原料且尚未確認清潔，不可改載需隔離的化工貨。' };
    }
    if (cargoIsFood && accepted.length && accepted.every(g => CHEM_LIKE.includes(g))) {
      return { ok: false, reason: '此車行只承接化工貨，與食品／藥用原料不相容。' };
    }
    return { ok: true };
  }

  function capacityCompatible(cargo, truck) {
    const truckRank = VEHICLE_META[truck.vehicleType]?.rank || 0;
    const cargoRank = VEHICLE_META[cargo.vehicleType]?.rank || 0;
    const coldRequired = String(cargo.temperature || '').includes('冷藏')
      || String(cargo.temperature || '').includes('冷凍')
      || cargo.vehicleType === '冷藏車';
    if (coldRequired && truck.vehicleType !== '冷藏車') {
      return { ok: false, reason: '此貨需要冷藏或冷凍車。' };
    }
    if (Number(truck.maxWeight) < Number(cargo.weight)) {
      return { ok: false, reason: `載重不足（貨物 ${cargo.weight} kg，車輛上限 ${truck.maxWeight} kg）。` };
    }
    if (cargo.volume && truck.maxVolume && Number(truck.maxVolume) < Number(cargo.volume)) {
      return { ok: false, reason: `材積不足（貨物 ${cargo.volume} m³，車輛上限 ${truck.maxVolume} m³）。` };
    }
    if (!(truckRank >= cargoRank || truck.vehicleType === '冷藏車')) {
      return { ok: false, reason: '車型級距小於貨物指定車型。' };
    }
    return { ok: true };
  }

  function estimatePrice(cargo, truck, settings) {
    const cfg = settings || global.HTData.DEFAULT_SETTINGS;
    const km = roadDistance(cargo.origin, cargo.destination);
    const coef = VEHICLE_META[cargo.vehicleType]?.coef || 1;
    const weightFactor = 1 + Math.min((Number(cargo.weight) || 0) / 15000, 0.35);
    const urgent = cargo.urgency === 'urgent' ? 1.18 : cargo.urgency === 'flexible' ? 0.93 : 1;
    const base = km * cfg.baseRate * coef * weightFactor * urgent * cfg.backhaulDiscount;
    const floor = (VEHICLE_META[cargo.vehicleType]?.rank || 2) <= 2 ? 2200 : 4200;
    const suggested = Math.round(Math.max(base, floor) / 100) * 100;
    if (truck && truck.askingPrice) {
      return Math.round(((suggested * 0.45) + (Number(truck.askingPrice) * 0.55)) / 100) * 100;
    }
    return suggested;
  }

  function computeSaving(originalFreight, backhaulPrice) {
    const original = Number(originalFreight) || 0;
    const backhaul = Number(backhaulPrice) || 0;
    /* 保留正負值：回頭車價高於原運費時為成本增加，不把數字藏成 0。 */
    return Math.round(original - backhaul);
  }

  /**
   * @returns {null|{ok:false, reasons:string[]}|object}
   * 硬條件不合時回傳 { ok:false, reasons }；可配對則回傳分數物件。
   */
  function getMatch(cargo, truck, settings) {
    const reasons = [];

    const dg = assessDangerousGoods(cargo);
    if (!dg.allowed) reasons.push(dg.reason);

    if (!hasYellowPlate(truck)) {
      reasons.push('此車未登記營業貨車（黃牌），依公路法不得有償載運他人貨物，第一版不媒合。');
    }
    if (!['可接單', '洽談中'].includes(truck.status)) {
      reasons.push('此車目前不是可接單狀態。');
    }

    const cap = capacityCompatible(cargo, truck);
    if (!cap.ok) reasons.push(cap.reason);

    const goods = goodsCompatible(cargo, truck);
    if (!goods.ok) reasons.push(goods.reason);

    if (cargo.origin && truck.origin && cargo.destination && truck.destination) {
      const pickupKm = roadDistance(cargo.origin, truck.origin);
      const destinationKm = roadDistance(cargo.destination, truck.destination);
      const dd = Math.abs(dayDiff(cargo.pickupDate, truck.availableDate));
      if (pickupKm > 180) reasons.push(`起點偏移 ${pickupKm} 公里，超過 180 公里。`);
      if (destinationKm > 220) reasons.push(`迄點偏移 ${destinationKm} 公里，超過 220 公里。`);
      if (dd > 3) reasons.push(`日期相差 ${dd} 天，超過 3 天。`);
      if (reasons.length) return { ok: false, reasons, dg };

      const originScore = clamp(100 - pickupKm * 0.85, 0, 100);
      const destScore = clamp(100 - destinationKm * 0.62, 0, 100);
      const dateScore = dd === 0 ? 100 : dd === 1 ? 82 : dd === 2 ? 58 : 36;
      const cargoRank = VEHICLE_META[cargo.vehicleType]?.rank || 1;
      const truckRank = VEHICLE_META[truck.vehicleType]?.rank || 1;
      const vehicleScore = truck.vehicleType === cargo.vehicleType
        ? 100
        : clamp(92 - Math.abs(truckRank - cargoRank) * 11, 55, 95);
      const loadRatio = Number(cargo.weight) / Number(truck.maxWeight);
      const capacityScore = loadRatio <= 0.95
        ? clamp(92 - Math.abs(0.72 - loadRatio) * 35, 72, 100)
        : 65;
      const suggested = estimatePrice(cargo, truck, settings);
      const target = Number(cargo.budget) || suggested;
      const priceScore = clamp(100 - (Math.max(0, suggested - target) / Math.max(target, 1)) * 130, 45, 100);
      const ratingScore = clamp((truck.rating || 4) * 20, 0, 100);
      const score = Math.round(
        originScore * 0.24 + destScore * 0.24 + dateScore * 0.16 +
        vehicleScore * 0.14 + capacityScore * 0.10 + priceScore * 0.06 + ratingScore * 0.06
      );
      const originalFreight = Number(cargo.originalFreight) || 0;
      const saving = computeSaving(originalFreight, suggested);
      return {
        ok: true,
        score,
        pickupKm,
        destinationKm,
        dd,
        originScore: Math.round(originScore),
        destScore: Math.round(destScore),
        dateScore,
        vehicleScore: Math.round(vehicleScore),
        capacityScore: Math.round(capacityScore),
        priceScore: Math.round(priceScore),
        ratingScore: Math.round(ratingScore),
        suggested,
        originalFreight,
        saving,
        dg
      };
    }

    if (reasons.length) return { ok: false, reasons, dg };
    return { ok: false, reasons: ['路線資料不完整'], dg };
  }

  function listMatches(cargo, trucks, settings) {
    return (trucks || [])
      .map(truck => ({ truck, match: getMatch(cargo, truck, settings) }))
      .filter(row => row.match && row.match.ok)
      .sort((a, b) => b.match.score - a.match.score);
  }

  function explainRejects(cargo, trucks, settings) {
    return (trucks || [])
      .map(truck => ({ truck, match: getMatch(cargo, truck, settings) }))
      .filter(row => !row.match || !row.match.ok);
  }

  global.HTMatch = {
    roadDistance,
    dayDiff,
    assessDangerousGoods,
    hasYellowPlate,
    goodsCompatible,
    capacityCompatible,
    estimatePrice,
    computeSaving,
    getMatch,
    listMatches,
    explainRejects
  };
})(window);
