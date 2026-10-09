export interface CommodityPriceDrivers {
  up: string;
  down: string;
}

const COMMODITY_PRICE_DRIVERS: Record<string, CommodityPriceDrivers> = {
  'GC=F': {
    up: 'Falling real yields, a weaker U.S. dollar, or rising geopolitical risk can boost gold demand.',
    down: 'Rising real yields or a stronger U.S. dollar can weigh on gold; calmer markets can reduce safe-haven buying.',
  },
  'SI=F': {
    up: 'Stronger solar and electronics demand, lower real yields, or safe-haven buying can support silver.',
    down: 'Weak manufacturing demand, rising real yields, or a stronger U.S. dollar can pressure silver.',
  },
  'CL=F': {
    up: 'Conflict, sanctions, or shipping disruptions can threaten supply; OPEC+ cuts can tighten the market.',
    down: 'Demand slowdowns, rising inventories, or higher production can add supply and weigh on oil prices.',
  },
  'NG=F': {
    up: 'Cold winters, hot summers, or supply outages can raise energy demand or tighten available gas supply.',
    down: 'Mild weather, rising production, or high storage levels can leave more gas available.',
  },
  'HG=F': {
    up: 'Stronger construction, manufacturing, and grid demand—or mine disruptions—can tighten copper supply.',
    down: 'A manufacturing slowdown, a stronger U.S. dollar, or growing inventories can weigh on copper.',
  },
  'ZC=F': {
    up: 'Drought or heat in major growing regions can cut harvest expectations; stronger feed, ethanol, or export demand can add support.',
    down: 'Large harvests, weaker export or feed demand, and ample inventories can ease corn prices.',
  },
  'ZW=F': {
    up: 'Drought, frost, or export disruptions in major producing regions can tighten global wheat supply.',
    down: 'Large harvests, better crop conditions, or stronger export competition can increase available wheat.',
  },
  'ZS=F': {
    up: 'Hot, dry weather in the U.S. or South America can reduce yields; stronger crush or export demand can support soybeans.',
    down: 'Large harvests, weak exports, or lower crush demand can add to soybean supplies.',
  },
  'KC=F': {
    up: 'Drought, frost, or crop disease in Brazil or Vietnam can reduce coffee supply; shipping disruptions can tighten availability.',
    down: 'Strong harvests in major producers or weaker consumption can increase available coffee.',
  },
  'CT=F': {
    up: 'Drought or heat in major producers can cut cotton yields; stronger textile demand can tighten the market.',
    down: 'Good harvests, weak textile demand, or rising inventories can pressure cotton prices.',
  },
  'SB=F': {
    up: 'Poor weather or lower output in Brazil and India can tighten export supply; ethanol demand can compete for sugarcane.',
    down: 'Large harvests or export surpluses can add sugar supply; weaker ethanol demand may free cane for sugar.',
  },
  'PL=F': {
    up: 'Mine or power disruptions in South Africa, or stronger auto-catalyst demand, can tighten platinum supply.',
    down: 'Weak vehicle demand, more recycling, or substitution away from platinum can weigh on prices.',
  },
  'PA=F': {
    up: 'Supply disruptions in Russia or South Africa, or stronger gasoline-vehicle catalyst demand, can tighten palladium supply.',
    down: 'EV adoption, substitution with platinum, more recycling, or weaker vehicle sales can reduce palladium demand.',
  },
  'LE=F': {
    up: 'Tighter cattle supplies or stronger beef demand can support prices; high feed costs may limit future herd expansion.',
    down: 'More cattle ready for market or weaker beef demand can pressure prices; lower feed costs can encourage supply over time.',
  },
  'HE=F': {
    up: 'Disease losses, fewer market-ready hogs, or stronger pork and export demand can tighten supply.',
    down: 'Larger hog supplies, weak pork demand, or rising cold-storage stocks can weigh on hog prices.',
  },
};

export function getCommodityPriceDrivers(symbol: string): CommodityPriceDrivers | null {
  return COMMODITY_PRICE_DRIVERS[symbol.trim().toUpperCase()] ?? null;
}
