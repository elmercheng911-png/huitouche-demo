/* 回頭車示範資料與常數。全部為虛構示例，不含真實公司出貨資料。 */
(function (global) {
  const CITIES = {
    '基隆市': [25.1276, 121.7392],
    '台北市': [25.0330, 121.5654],
    '新北市': [25.0169, 121.4628],
    '桃園市': [24.9937, 121.3010],
    '新竹市': [24.8138, 120.9675],
    '苗栗縣': [24.5602, 120.8214],
    '台中市': [24.1477, 120.6736],
    '彰化縣': [24.0518, 120.5161],
    '南投縣': [23.9609, 120.9719],
    '雲林縣': [23.7092, 120.4313],
    '嘉義市': [23.4801, 120.4491],
    '台南市': [22.9999, 120.2269],
    '高雄市': [22.6273, 120.3014],
    '屏東縣': [22.5519, 120.5488],
    '宜蘭縣': [24.7021, 121.7378],
    '花蓮縣': [23.9911, 121.6112],
    '台東縣': [22.7554, 121.1500]
  };

  const VEHICLE_META = {
    '小貨車 1.75噸': { coef: 0.78, rank: 1, defaultWeight: 1200, defaultVolume: 5 },
    '3.5噸貨車': { coef: 1, rank: 2, defaultWeight: 2600, defaultVolume: 9 },
    '5噸貨車': { coef: 1.18, rank: 3, defaultWeight: 4200, defaultVolume: 16 },
    '8噸貨車': { coef: 1.38, rank: 4, defaultWeight: 7000, defaultVolume: 25 },
    '17噸大貨車': { coef: 1.72, rank: 5, defaultWeight: 15000, defaultVolume: 40 },
    '20呎貨櫃': { coef: 1.86, rank: 6, defaultWeight: 18000, defaultVolume: 33 },
    '冷藏車': { coef: 1.65, rank: 4, defaultWeight: 6500, defaultVolume: 18 }
  };

  const GOODS_TYPES = ['化工原料', '食品添加物', '藥用原料', '包裝材料', '其他常溫貨'];
  const FOOD_LIKE = ['食品添加物', '藥用原料'];
  const CHEM_LIKE = ['化工原料'];

  const PHYSICAL_STATES = ['固體', '液體', '氣體'];

  /* 道路交通安全規則第 84 條：罐槽車以外貨車，低於門檻得不適用通行證等規定。v1 超過即擋下。 */
  const DG_LIMITS_KG = { '氣體': 50, '液體': 100, '固體': 200 };

  const PACKAGING = ['紙袋／袋裝', '桶裝', '紙箱', '棧板', 'IBC 噸桶', '其他'];
  const SPECIAL_REQS = ['防潮', '需檢附 SDS', '避光', '需堆高機', '需溫度紀錄', '不可與食品或藥用混載', '直立擺放'];
  const TEMPERATURES = ['常溫', '避光／乾燥', '冷藏 0–7°C', '冷凍'];
  const URGENCY = [
    { id: 'urgent', label: '急件' },
    { id: 'normal', label: '一般' },
    { id: 'flexible', label: '可彈性' }
  ];

  const LICENCES = ['營業貨車（黃牌）', '危險物品運送訓練', '食品添加物衛生證明', '冷鏈溫度校正'];
  const TRUCK_EQUIPMENT = ['一般尾門', '升降尾門', '油壓拖板車', '冷藏機組', '側簾車廂', '防水篷布'];

  const ROLES = {
    shipper: { label: '貨主', desc: '刊登待運貨物、查看媒合與節省' },
    carrier: { label: '車行／司機', desc: '登記回程空車、承接適合的貨' },
    ops: { label: '調度', desc: '內部工具全功能，追蹤每趟節省' }
  };

  const DEMO_USERS = [
    { id: 'u-shipper', email: 'shipper@demo.huitouche.tw', name: '林雅婷', role: 'shipper', org: '青葉原料行（示範）', password: 'demo' },
    { id: 'u-carrier', email: 'carrier@demo.huitouche.tw', name: '陳建宏', role: 'carrier', org: '環島貨運（示範）', password: 'demo' },
    { id: 'u-ops', email: 'ops@demo.huitouche.tw', name: '張嘉玲', role: 'ops', org: '內部調度（示範）', password: 'demo' }
  ];

  const BOOKING_FLOW = ['待確認', '已確認', '運送中', '已完成'];
  const NEXT_STATUS = { '待確認': '已確認', '已確認': '運送中', '運送中': '已完成' };
  const STATUS_ACTION = { '待確認': '確認訂單', '已確認': '開始運送', '運送中': '完成簽收' };

  const DEFAULT_SETTINGS = { baseRate: 34, backhaulDiscount: 0.72 };

  function addDays(n) {
    const x = new Date();
    x.setDate(x.getDate() + n);
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const d = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function hoursAgo(h) {
    return new Date(Date.now() - h * 3600000).toISOString();
  }

  function defaultState() {
    const cargos = [
      {
        id: 'CG-1001', title: '食品級檸檬酸（袋裝）', owner: '青葉原料行（示範）',
        origin: '台北市', destination: '台中市', pickupDate: addDays(1), deliveryDate: addDays(1),
        vehicleType: '3.5噸貨車', temperature: '避光／乾燥', goodsType: '食品添加物',
        packaging: '紙袋／袋裝', physicalState: '固體', isDangerous: false, weight: 1200, volume: 4.5,
        originalFreight: 7200, budget: 5600, urgency: 'normal',
        specialReqs: ['防潮', '需堆高機'], docs: ['SDS', '食添檢驗報告（示範）'],
        note: '棧板貨，卸貨端有堆高機，不可淋雨。此為虛構示範資料。',
        status: '待配對', createdAt: hoursAgo(3)
      },
      {
        id: 'CG-1002', title: '藥用輔料玉米澱粉', owner: '和風藥粧（示範）',
        origin: '台南市', destination: '桃園市', pickupDate: addDays(2), deliveryDate: addDays(3),
        vehicleType: '5噸貨車', temperature: '避光／乾燥', goodsType: '藥用原料',
        packaging: '紙袋／袋裝', physicalState: '固體', isDangerous: false, weight: 2400, volume: 8,
        originalFreight: 16800, budget: 14000, urgency: 'normal',
        specialReqs: ['防潮', '避光'], docs: ['SDS', 'COA（示範）'],
        note: '需與一般化工品隔離，車廂保持乾燥。虛構示範資料。',
        status: '詢價中', createdAt: hoursAgo(8)
      },
      {
        id: 'CG-1003', title: '食用色素預混粉', owner: '南山食添（示範）',
        origin: '新北市', destination: '高雄市', pickupDate: addDays(3), deliveryDate: addDays(4),
        vehicleType: '5噸貨車', temperature: '常溫', goodsType: '食品添加物',
        packaging: '紙箱', physicalState: '固體', isDangerous: false, weight: 860, volume: 6,
        originalFreight: 15200, budget: 11800, urgency: 'flexible',
        specialReqs: ['防潮', '避光'], docs: ['SDS'],
        note: '紙箱堆疊，避免重壓。虛構示範資料。',
        status: '待配對', createdAt: hoursAgo(20)
      },
      {
        id: 'CG-1004', title: '工業用甘油（非危品示範）', owner: '晨溪化工（示範）',
        origin: '台中市', destination: '高雄市', pickupDate: addDays(4), deliveryDate: addDays(5),
        vehicleType: '8噸貨車', temperature: '常溫', goodsType: '化工原料',
        packaging: '桶裝', physicalState: '液體', isDangerous: false, weight: 5200, volume: 11,
        originalFreight: 15500, budget: 12800, urgency: 'normal',
        specialReqs: ['需檢附 SDS', '直立擺放', '不可與食品或藥用混載'], docs: ['SDS'],
        note: '非危險物品示範；桶裝需直立固定。虛構示範資料。',
        status: '已成交', createdAt: hoursAgo(36)
      },
      {
        id: 'CG-1005', title: '食品級抗結劑（袋裝）', owner: '南山食添（示範）',
        origin: '台中市', destination: '台北市', pickupDate: addDays(1), deliveryDate: addDays(2),
        vehicleType: '3.5噸貨車', temperature: '避光／乾燥', goodsType: '食品添加物',
        packaging: '紙袋／袋裝', physicalState: '固體', isDangerous: false, weight: 900, volume: 3.8,
        originalFreight: 7800, budget: 6000, urgency: 'urgent',
        specialReqs: ['防潮'], docs: ['SDS'],
        note: '希望隔日抵達。虛構示範資料。',
        status: '待配對', createdAt: hoursAgo(6)
      }
    ];

    const trucks = [
      {
        id: 'TR-2001', company: '環島貨運（示範）', driver: '陳建宏', plate: 'KDA-2387',
        vehicleType: '3.5噸貨車', origin: '新北市', destination: '台中市',
        availableDate: addDays(1), endDate: addDays(2), maxWeight: 2500, maxVolume: 9,
        askingPrice: 5200, rating: 4.9, phone: '0900-000-001', equipment: '升降尾門',
        licences: ['營業貨車（黃牌）', '食品添加物衛生證明'],
        acceptedGoods: ['食品添加物', '藥用原料', '包裝材料'],
        lastGoodsType: '食品添加物', cleaned: true,
        note: '可提早一小時到場，車廂已清潔乾燥。', status: '可接單', createdAt: hoursAgo(4)
      },
      {
        id: 'TR-2002', company: '南港通運（示範）', driver: '林佳穎', plate: 'BQE-7712',
        vehicleType: '5噸貨車', origin: '高雄市', destination: '桃園市',
        availableDate: addDays(2), endDate: addDays(3), maxWeight: 4500, maxVolume: 16,
        askingPrice: 13200, rating: 4.8, phone: '0900-000-002', equipment: '油壓拖板車',
        licences: ['營業貨車（黃牌）', '食品添加物衛生證明'],
        acceptedGoods: ['食品添加物', '藥用原料', '包裝材料'],
        lastGoodsType: '藥用原料', cleaned: true,
        note: '回程北上，可沿途順載。', status: '可接單', createdAt: hoursAgo(10)
      },
      {
        id: 'TR-2003', company: '中部回程車行（示範）', driver: '黃志偉', plate: 'LHB-3521',
        vehicleType: '8噸貨車', origin: '台中市', destination: '高雄市',
        availableDate: addDays(4), endDate: addDays(5), maxWeight: 7200, maxVolume: 25,
        askingPrice: 12500, rating: 5.0, phone: '0900-000-003', equipment: '側簾車廂',
        licences: ['營業貨車（黃牌）'],
        acceptedGoods: ['化工原料', '包裝材料', '其他常溫貨'],
        lastGoodsType: '化工原料', cleaned: true,
        note: '可協助棧板交換，不承載食品與藥用原料。', status: '已排程', createdAt: hoursAgo(30)
      },
      {
        id: 'TR-2004', company: '風行快運（示範）', driver: '吳承恩', plate: 'AQF-6195',
        vehicleType: '5噸貨車', origin: '台北市', destination: '高雄市',
        availableDate: addDays(3), endDate: addDays(4), maxWeight: 4000, maxVolume: 15,
        askingPrice: 11000, rating: 4.6, phone: '0900-000-004', equipment: '防水篷布',
        licences: ['營業貨車（黃牌）', '食品添加物衛生證明'],
        acceptedGoods: ['食品添加物', '藥用原料', '包裝材料', '其他常溫貨'],
        lastGoodsType: '包裝材料', cleaned: true,
        note: '南下回程，防水篷布已備。', status: '可接單', createdAt: hoursAgo(18)
      },
      {
        id: 'TR-2005', company: '北宜聯運（示範）', driver: '鄭雅文', plate: 'TKE-9013',
        vehicleType: '3.5噸貨車', origin: '宜蘭縣', destination: '台北市',
        availableDate: addDays(1), endDate: addDays(2), maxWeight: 2300, maxVolume: 8,
        askingPrice: 4200, rating: 4.5, phone: '0900-000-005', equipment: '一般尾門',
        licences: ['營業貨車（黃牌）'],
        acceptedGoods: ['包裝材料', '其他常溫貨', '食品添加物'],
        lastGoodsType: '其他常溫貨', cleaned: true,
        note: '可順載新北地區。', status: '可接單', createdAt: hoursAgo(44)
      },
      {
        id: 'TR-2006', company: '示範自用車（應被排除）', driver: '（示範）', plate: 'ABC-0001',
        vehicleType: '3.5噸貨車', origin: '台北市', destination: '台中市',
        availableDate: addDays(1), endDate: addDays(2), maxWeight: 2500, maxVolume: 9,
        askingPrice: 3000, rating: 4.0, phone: '0900-000-009', equipment: '一般尾門',
        licences: [],
        acceptedGoods: ['食品添加物', '化工原料', '藥用原料'],
        lastGoodsType: '', cleaned: true,
        note: '此筆刻意沒有營業車牌，用來示範白牌車不會進入媒合。', status: '可接單', createdAt: hoursAgo(2)
      }
    ];

    const trips = [
      {
        id: 'BK-3001', cargoId: 'CG-1004', truckId: 'TR-2003',
        originalFreight: 15500, backhaulPrice: 12600, saving: 2900,
        status: '已確認', note: '含稅，卸貨端有堆高機。金流不經本示範平台。',
        createdAt: hoursAgo(18), updatedAt: hoursAgo(3)
      },
      {
        id: 'BK-3002', cargoId: 'CG-1002', truckId: 'TR-2002',
        originalFreight: 16800, backhaulPrice: 13200, saving: 3600,
        status: '待確認', note: '待貨主確認裝貨時間。',
        createdAt: hoursAgo(7), updatedAt: hoursAgo(7)
      }
    ];

    return {
      version: 2,
      role: 'ops',
      userId: 'u-ops',
      cargos,
      trucks,
      trips,
      settings: { ...DEFAULT_SETTINGS },
      activities: [
        { id: 'AC-1', text: '中部回程車行與「工業用甘油」完成媒合', detail: '台中市 → 高雄市，原運費 NT$15,500，回頭車價 NT$12,600，節省 NT$2,900', time: hoursAgo(3) },
        { id: 'AC-2', text: '新增回程車源：北宜聯運（示範）', detail: '宜蘭縣 → 台北市，3.5噸貨車', time: hoursAgo(5) },
        { id: 'AC-3', text: '和風藥粧貨運需求進入詢價', detail: '台南市 → 桃園市，藥用輔料玉米澱粉', time: hoursAgo(7) },
        { id: 'AC-4', text: '示範資料已載入', detail: '所有貨主、車行與金額皆為虛構示例', time: hoursAgo(24) }
      ],
      notifications: [
        { id: 'NT-1', title: '有新的高分配對', body: '食品級檸檬酸與環島貨運的配對分數偏高，可檢視後決定是否建立趟次。', time: hoursAgo(0.4) },
        { id: 'NT-2', title: '訂單待確認', body: 'BK-3002 尚未確認裝貨時間與最終運價。', time: hoursAgo(1.3) },
        { id: 'NT-3', title: '這是示範版', body: '資料只存在這台裝置的瀏覽器，正式營運前不會對外媒合或收款。', time: hoursAgo(3) }
      ]
    };
  }

  global.HTData = {
    CITIES,
    CITY_LIST: Object.keys(CITIES),
    VEHICLE_META,
    VEHICLE_TYPES: Object.keys(VEHICLE_META),
    GOODS_TYPES,
    FOOD_LIKE,
    CHEM_LIKE,
    PHYSICAL_STATES,
    DG_LIMITS_KG,
    PACKAGING,
    SPECIAL_REQS,
    TEMPERATURES,
    URGENCY,
    LICENCES,
    TRUCK_EQUIPMENT,
    ROLES,
    DEMO_USERS,
    BOOKING_FLOW,
    NEXT_STATUS,
    STATUS_ACTION,
    DEFAULT_SETTINGS,
    addDays,
    defaultState
  };
})(window);
