/* Bill's Garage — maintenance database + icons
   Intervals are general starting points (whichever comes first).
   Every machine's schedule is fully editable in the app. Always check the owner's manual. */

const ICONS = {
  oil: '<path d="M3 15h13l4-6-5 1-2-2H7L5 10H3z"/><path d="M20 9l1.5 3a1.5 1.5 0 1 1-3 0z"/>',
  blade: '<circle cx="12" cy="12" r="8"/><path d="M12 4c2 3 2 5 0 8M20 12c-3 2-5 2-8 0M12 20c-2-3-2-5 0-8M4 12c3-2 5-2 8 0"/>',
  battery: '<rect x="3" y="7" width="16" height="11" rx="2"/><path d="M21 11v3M7 12.5h4M9 10.5v4"/>',
  filter: '<path d="M4 5h16l-6 8v6l-4 2v-8z"/>',
  plug: '<path d="M12 2v4M9 6h6v4H9zM10 10h4v6h-4zM12 16v6"/>',
  tire: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
  belt: '<circle cx="7" cy="12" r="4"/><circle cx="18" cy="12" r="3"/><path d="M7 8l11 1M7 16l11-1"/>',
  grease: '<path d="M4 20l6-6M10 14l3 3 7-7-3-3zM15 5l4 4"/>',
  wrench: '<path d="M14.5 5.5a4 4 0 0 0 5 5L11 19a2.1 2.1 0 0 1-3-3l8.5-8.5"/><path d="M14.5 5.5L17 3"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.5 8-8 9-4.5-1-8-4.5-8-9V6z"/>',
  fuel: '<rect x="4" y="3" width="10" height="18" rx="1.5"/><path d="M4 9h10M14 8l4 3v7a1.5 1.5 0 0 0 3 0v-9l-3-3"/>',
  chain: '<rect x="2.5" y="9" width="9" height="6" rx="3"/><rect x="12.5" y="9" width="9" height="6" rx="3"/>',
  coolant: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  brake: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/><path d="M6 6.5A8.5 8.5 0 0 0 6 17.5"/>',
  wiper: '<path d="M3 18a12 12 0 0 1 18 0M12 18L18 7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  snow: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  air: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8"/>',
  check: '<path d="M4 12l5 5L20 6"/>',
  receipt: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4"/>',
  note: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h8M9 17h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="4"/>',
  scan: '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M7 12h10"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  snooze: '<path d="M12 21a8 8 0 1 0-8-8M4 4l3 3M20 4l-3 3M9 10h5l-5 6h5"/>',
  garage: '<path d="M3 10l9-6 9 6v10H3z"/><path d="M7 20v-7h10v7M7 16h10"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/>',
  alert: '<path d="M12 3l10 18H2zM12 10v5M12 18v.5"/>',
  gauge: '<path d="M4 18a9 9 0 1 1 16 0"/><path d="M12 14l4-5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  print: '<path d="M7 9V3h10v6M7 17H4v-8h16v8h-3M7 14h10v7H7z"/>',
  link: '<path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1"/>',
  storage: '<path d="M4 7h16v13H4zM4 7l2-4h12l2 4M10 11h4"/>',
};

function icon(name, size = 16, extra = '') {
  const p = ICONS[name] || ICONS.wrench;
  return `<svg class="ic ${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

/* Large line-art used on machine cards when there's no photo */
const ART = {
  car: '<path d="M8 42v-9l6-11h30l9 11h4v9z"/><path d="M17 22l-3 10h37l-7-10M30 22v10"/><circle cx="19" cy="43" r="5"/><circle cx="47" cy="43" r="5"/>',
  truck: '<path d="M5 43V29h25V17h13l9 11h7v15z"/><path d="M34 21v8h14"/><circle cx="16" cy="44" r="5"/><circle cx="48" cy="44" r="5"/>',
  motorcycle: '<circle cx="14" cy="42" r="9"/><circle cx="50" cy="42" r="9"/><path d="M14 42l11-13h13l12 13M25 29l-3-6h-6M38 29l7-9h6M30 29l4 8"/>',
  mower: '<path d="M6 44h44l4-6H10z"/><path d="M24 38V22h14v16M22 22l2-8h16l2 8"/><circle cx="14" cy="47" r="4"/><circle cx="46" cy="44" r="7"/>',
  tractor: '<circle cx="45" cy="40" r="12"/><circle cx="45" cy="40" r="4"/><circle cx="15" cy="45" r="6"/><path d="M9 39V30h21V18h12v12M30 30h3M22 30V20"/>',
  generator: '<rect x="8" y="16" width="48" height="30" rx="5"/><rect x="15" y="23" width="16" height="12" rx="2"/><path d="M38 24h11M38 30h11M8 26h-3M12 46v3M52 46v3"/><circle cx="14" cy="51" r="3"/>',
  washer: '<rect x="12" y="20" width="18" height="24" rx="4"/><path d="M21 20V9h-6M30 30c12 0 14 6 26-2M49 22l9-9"/><circle cx="15" cy="48" r="4"/><circle cx="28" cy="48" r="4"/>',
  splitter: '<path d="M4 38h46M50 32v12M14 38V28h14v10"/><path d="M50 32l8 6-8 6"/><circle cx="20" cy="46" r="5"/><path d="M4 38l-2 6"/>',
  chainsaw: '<rect x="6" y="24" width="22" height="16" rx="4"/><rect x="28" y="28" width="30" height="8" rx="4"/><path d="M10 24v-6h12v6"/>',
  snowblower: '<path d="M8 46V30h22v16z"/><path d="M30 34l20-14M42 20l12 0"/><path d="M12 30v-6h14v6"/><circle cx="14" cy="49" r="3"/>',
  boat: '<path d="M4 38h56l-9 12H13z"/><path d="M18 38V28h18l6 10M48 38V22"/>',
  trailer: '<path d="M8 36h40v-8H8zM48 34h12"/><circle cx="26" cy="42" r="6"/>',
  atv: '<circle cx="16" cy="42" r="8"/><circle cx="48" cy="42" r="8"/><path d="M8 32h48l-6-8H34l-4-6h-8l-2 6H14z"/>',
  other: '<path d="M38 12a10 10 0 0 0 12 12L28 46a5 5 0 0 1-7-7l22-22"/><path d="M38 12l6-6"/>',
};

function art(cat, size = 72) {
  const a = ART[(CATS[cat] || {}).art || cat] || ART.other;
  return `<svg class="art-svg" width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${a}</svg>`;
}

/* unit: what the machine counts. 'mi' odometer, 'hrs' hour meter, 'none' time only.
   rate: typical usage per day, used to estimate due dates until real readings come in. */
const CATS = {
  car:        { label: 'Car / SUV',        group: 'Vehicles',  unit: 'mi',  rate: 33,   art: 'car' },
  truck:      { label: 'Pickup truck',     group: 'Vehicles',  unit: 'mi',  rate: 35,   art: 'truck' },
  motorcycle: { label: 'Motorcycle',       group: 'Vehicles',  unit: 'mi',  rate: 8,    art: 'motorcycle' },
  atv:        { label: 'ATV / UTV',        group: 'Vehicles',  unit: 'hrs', rate: 0.3,  art: 'atv' },
  zeroturn:   { label: 'Zero-turn mower',  group: 'Lawn & yard', unit: 'hrs', rate: 0.35, art: 'mower' },
  riding:     { label: 'Riding mower',     group: 'Lawn & yard', unit: 'hrs', rate: 0.3,  art: 'mower' },
  pushmower:  { label: 'Push mower',       group: 'Lawn & yard', unit: 'hrs', rate: 0.15, art: 'mower' },
  tractor:    { label: 'Compact tractor',  group: 'Lawn & yard', unit: 'hrs', rate: 0.4,  art: 'tractor' },
  snowblower: { label: 'Snowblower',       group: 'Lawn & yard', unit: 'hrs', rate: 0.1,  art: 'snowblower' },
  chainsaw:   { label: 'Chainsaw',         group: 'Lawn & yard', unit: 'hrs', rate: 0.1,  art: 'chainsaw' },
  generator:  { label: 'Generator',        group: 'Power equipment', unit: 'hrs', rate: 0.2, art: 'generator' },
  pwgas:      { label: 'Pressure washer (gas)',      group: 'Power equipment', unit: 'hrs', rate: 0.08, art: 'washer' },
  pwelec:     { label: 'Pressure washer (electric)', group: 'Power equipment', unit: 'none', rate: 0, art: 'washer' },
  splitter:   { label: 'Log splitter',     group: 'Power equipment', unit: 'hrs', rate: 0.1,  art: 'splitter' },
  boat:       { label: 'Boat / outboard',  group: 'Other', unit: 'hrs', rate: 0.2, art: 'boat' },
  trailer:    { label: 'Trailer',          group: 'Other', unit: 'none', rate: 0, art: 'trailer' },
  other:      { label: 'Something else',   group: 'Other', unit: 'hrs', rate: 0.2, art: 'other' },
};

/* t(key, title, icon, every{mi,hrs,months}, extra)
   extra.first = break-in first service interval, extra.severe = severe-duty interval,
   extra.need = parts hint, extra.how = how-to search phrase */
function t(key, title, ic, every, extra = {}) { return { key, title, icon: ic, every, ...extra }; }

const OIL_CAR = t('oil', 'Oil change', 'oil', { mi: 5000, months: 6 }, { severe: { mi: 3500, months: 4 }, need: ['Engine oil (check manual for weight & capacity)', 'Oil filter'], how: 'oil change' });

const TEMPLATES = {
  car: [
    OIL_CAR,
    t('rotate', 'Tire rotation', 'tire', { mi: 6000, months: 6 }, { how: 'tire rotation' }),
    t('airfilter', 'Engine air filter', 'air', { mi: 20000, months: 24 }, { severe: { mi: 12000, months: 12 }, need: ['Engine air filter'], how: 'replace engine air filter' }),
    t('cabin', 'Cabin air filter', 'filter', { mi: 15000, months: 12 }, { need: ['Cabin air filter'], how: 'replace cabin air filter' }),
    t('brakes', 'Brake inspection', 'brake', { mi: 12000, months: 12 }, { how: 'brake pad inspection' }),
    t('wipers', 'Wiper blades', 'wiper', { months: 12 }, { need: ['Wiper blades (driver + passenger sizes)'], how: 'replace wiper blades' }),
    t('battery', 'Battery test', 'battery', { months: 12 }, { how: 'car battery test' }),
    t('coolant', 'Coolant flush', 'coolant', { mi: 60000, months: 60 }, { how: 'coolant flush' }),
    t('trans', 'Transmission fluid', 'gear', { mi: 60000, months: 60 }, { severe: { mi: 30000 }, how: 'transmission fluid change' }),
    t('plugs', 'Spark plugs', 'plug', { mi: 100000, months: 96 }, { need: ['Spark plugs'], how: 'replace spark plugs' }),
  ],
  truck: [
    OIL_CAR,
    t('rotate', 'Tire rotation', 'tire', { mi: 6000, months: 6 }, { how: 'tire rotation truck' }),
    t('airfilter', 'Engine air filter', 'air', { mi: 20000, months: 24 }, { severe: { mi: 12000, months: 12 }, need: ['Engine air filter'], how: 'replace truck air filter' }),
    t('cabin', 'Cabin air filter', 'filter', { mi: 15000, months: 12 }, { need: ['Cabin air filter'] }),
    t('brakes', 'Brake inspection', 'brake', { mi: 12000, months: 12 }),
    t('diff', 'Differential fluid', 'gear', { mi: 50000 }, { severe: { mi: 30000 }, how: 'differential fluid change' }),
    t('trans', 'Transmission fluid', 'gear', { mi: 60000, months: 60 }, { severe: { mi: 30000 } }),
    t('coolant', 'Coolant flush', 'coolant', { mi: 60000, months: 60 }),
    t('wipers', 'Wiper blades', 'wiper', { months: 12 }, { need: ['Wiper blades'] }),
    t('battery', 'Battery test', 'battery', { months: 12 }),
    t('plugs', 'Spark plugs', 'plug', { mi: 100000, months: 96 }, { need: ['Spark plugs'] }),
  ],
  motorcycle: [
    t('oil', 'Oil & filter', 'oil', { mi: 4000, months: 12 }, { first: { mi: 600 }, need: ['Motorcycle oil (JASO MA)', 'Oil filter'], how: 'motorcycle oil change' }),
    t('chainlube', 'Clean & lube chain', 'chain', { mi: 500, months: 1 }, { need: ['Chain cleaner', 'Chain lube'], how: 'motorcycle chain clean and lube' }),
    t('chainadj', 'Chain slack check', 'chain', { mi: 1000 }, { how: 'motorcycle chain adjustment' }),
    t('tires', 'Tire pressure & tread', 'tire', { mi: 1000, months: 1 }),
    t('brakefluid', 'Brake fluid', 'brake', { months: 24 }, { need: ['DOT 4 brake fluid'], how: 'motorcycle brake fluid flush' }),
    t('coolant', 'Coolant', 'coolant', { months: 24 }),
    t('airfilter', 'Air filter', 'air', { mi: 12000, months: 24 }, { need: ['Air filter'] }),
    t('plugs', 'Spark plugs', 'plug', { mi: 8000, months: 24 }, { need: ['Spark plugs'] }),
    t('valves', 'Valve clearance check', 'gear', { mi: 15000 }),
    t('battery', 'Battery / tender', 'battery', { months: 6 }),
  ],
  atv: [
    t('oil', 'Oil & filter', 'oil', { hrs: 100, months: 12 }, { first: { hrs: 10 }, need: ['Engine oil', 'Oil filter'] }),
    t('airfilter', 'Air filter', 'air', { hrs: 25, months: 6 }, { severe: { hrs: 10 }, need: ['Air filter'] }),
    t('grease', 'Grease fittings', 'grease', { hrs: 25, months: 3 }),
    t('cvt', 'Drive belt inspection', 'belt', { hrs: 100, months: 12 }),
    t('diff', 'Front & rear diff fluid', 'gear', { hrs: 100, months: 12 }),
    t('plugs', 'Spark plug', 'plug', { hrs: 100, months: 12 }, { need: ['Spark plug'] }),
    t('tires', 'Tire pressure', 'tire', { months: 1 }),
  ],
  zeroturn: [
    t('oil', 'Oil & filter', 'oil', { hrs: 50, months: 12 }, { first: { hrs: 8 }, severe: { hrs: 25 }, need: ['Engine oil (10W-30 or per manual)', 'Oil filter'], how: 'zero turn mower oil change' }),
    t('blades', 'Sharpen blades', 'blade', { hrs: 25 }, { need: ['Blade bolts (if replacing)'], how: 'sharpen mower blades' }),
    t('airfilter', 'Air filter', 'air', { hrs: 100, months: 12 }, { severe: { hrs: 50 }, need: ['Air filter + pre-filter'], how: 'mower air filter' }),
    t('plug', 'Spark plug', 'plug', { hrs: 100, months: 12 }, { need: ['Spark plug'] }),
    t('grease', 'Grease fittings', 'grease', { hrs: 25 }, { need: ['Grease gun + grease'], how: 'zero turn grease points' }),
    t('belt', 'Deck belt inspection', 'belt', { hrs: 50 }),
    t('hydro', 'Hydro transmission fluid', 'gear', { hrs: 400 }, { how: 'zero turn hydro fluid change' }),
    t('fuelfilter', 'Fuel filter', 'fuel', { hrs: 200, months: 12 }, { need: ['Inline fuel filter'] }),
    t('tires', 'Tire pressure', 'tire', { months: 1 }),
    t('winter', 'Winter storage prep', 'snow', { months: 12 }, { need: ['Fuel stabilizer', 'Battery tender'], how: 'mower winter storage' }),
  ],
  riding: [
    t('oil', 'Oil & filter', 'oil', { hrs: 50, months: 12 }, { first: { hrs: 8 }, need: ['Engine oil', 'Oil filter'], how: 'riding mower oil change' }),
    t('blades', 'Sharpen blades', 'blade', { hrs: 25 }, { how: 'sharpen riding mower blades' }),
    t('airfilter', 'Air filter', 'air', { hrs: 100, months: 12 }, { need: ['Air filter'] }),
    t('plug', 'Spark plug', 'plug', { hrs: 100, months: 12 }, { need: ['Spark plug'] }),
    t('belt', 'Deck & drive belt check', 'belt', { hrs: 50 }),
    t('grease', 'Grease fittings', 'grease', { hrs: 25 }),
    t('tires', 'Tire pressure', 'tire', { months: 1 }),
    t('winter', 'Winter storage prep', 'snow', { months: 12 }, { need: ['Fuel stabilizer', 'Battery tender'] }),
  ],
  pushmower: [
    t('oil', 'Oil change', 'oil', { hrs: 50, months: 12 }, { first: { hrs: 5 }, need: ['SAE 30 or 10W-30 oil'], how: 'push mower oil change' }),
    t('blades', 'Sharpen blade', 'blade', { hrs: 25, months: 12 }),
    t('airfilter', 'Air filter', 'air', { hrs: 25, months: 12 }, { need: ['Air filter'] }),
    t('plug', 'Spark plug', 'plug', { hrs: 100, months: 12 }, { need: ['Spark plug'] }),
    t('winter', 'Winter storage prep', 'snow', { months: 12 }, { need: ['Fuel stabilizer'] }),
  ],
  tractor: [
    t('oil', 'Engine oil & filter', 'oil', { hrs: 200, months: 12 }, { first: { hrs: 50 }, need: ['Diesel engine oil', 'Oil filter'], how: 'compact tractor oil change' }),
    t('grease', 'Grease all fittings', 'grease', { hrs: 10 }, { need: ['Grease gun + grease'], how: 'compact tractor grease points' }),
    t('airfilter', 'Air filter check', 'air', { hrs: 100, months: 12 }, { need: ['Air filter (inner + outer)'] }),
    t('fuelfilter', 'Fuel filter', 'fuel', { hrs: 400, months: 12 }, { need: ['Fuel filter'] }),
    t('hydro', 'Hydraulic/trans fluid & filter', 'gear', { hrs: 400 }, { first: { hrs: 50 }, need: ['Hydraulic fluid (per manual)', 'Hydraulic filter'] }),
    t('coolant', 'Coolant', 'coolant', { months: 24 }),
    t('tires', 'Tire pressure', 'tire', { months: 1 }),
    t('battery', 'Battery check', 'battery', { months: 12 }),
  ],
  snowblower: [
    t('oil', 'Oil change', 'oil', { hrs: 50, months: 12 }, { first: { hrs: 5 }, need: ['5W-30 oil'] }),
    t('plug', 'Spark plug', 'plug', { hrs: 100, months: 12 }, { need: ['Spark plug'] }),
    t('shear', 'Shear pins & auger check', 'gear', { months: 12 }, { need: ['Spare shear pins'] }),
    t('belt', 'Belt inspection', 'belt', { months: 12 }),
    t('storage', 'Off-season storage prep', 'storage', { months: 12 }, { need: ['Fuel stabilizer'] }),
  ],
  chainsaw: [
    t('chain', 'Sharpen chain', 'chain', { hrs: 5 }, { need: ['Round file / chain'], how: 'sharpen chainsaw chain' }),
    t('airfilter', 'Clean air filter', 'air', { hrs: 5 }),
    t('bar', 'Bar flip & groove clean', 'gear', { hrs: 10 }),
    t('plug', 'Spark plug', 'plug', { hrs: 100, months: 12 }, { need: ['Spark plug'] }),
    t('fuelfilter', 'Fuel filter', 'fuel', { months: 12 }),
  ],
  generator: [
    t('oil', 'Oil change', 'oil', { hrs: 100, months: 6 }, { first: { hrs: 20, months: 1 }, severe: { hrs: 50 }, need: ['10W-30 engine oil'], how: 'generator oil change' }),
    t('airfilter', 'Clean air filter', 'air', { hrs: 50, months: 3 }, { need: ['Air filter'] }),
    t('plug', 'Spark plug', 'plug', { hrs: 100, months: 12 }, { need: ['Spark plug'] }),
    t('arrestor', 'Spark arrestor cleaning', 'gear', { hrs: 100, months: 6 }),
    t('exercise', 'Run under load', 'clock', { months: 1 }, { how: 'exercise generator monthly' }),
    t('fuel', 'Fresh / stabilized fuel', 'fuel', { months: 3 }, { need: ['Fuel stabilizer'] }),
  ],
  pwgas: [
    t('oil', 'Engine oil', 'oil', { hrs: 50, months: 12 }, { first: { hrs: 5 }, need: ['Engine oil'], how: 'pressure washer oil change' }),
    t('pumpoil', 'Pump oil', 'oil', { hrs: 50, months: 12 }, { need: ['Pump oil'] , how: 'pressure washer pump oil change'}),
    t('inlet', 'Inlet screen & nozzles', 'filter', { hrs: 25, months: 6 }),
    t('plug', 'Spark plug', 'plug', { hrs: 100, months: 12 }, { need: ['Spark plug'] }),
    t('winter', 'Pump saver / winterize', 'snow', { months: 12 }, { need: ['Pump saver'], how: 'winterize pressure washer pump' }),
  ],
  pwelec: [
    t('inlet', 'Inlet filter', 'filter', { months: 3 }),
    t('hoses', 'Hoses & O-rings', 'gear', { months: 6 }),
    t('winter', 'Winterize pump', 'snow', { months: 12 }, { need: ['Pump saver'] }),
  ],
  splitter: [
    t('oil', 'Engine oil', 'oil', { hrs: 50, months: 12 }, { first: { hrs: 5 }, need: ['Engine oil'] }),
    t('hydfluid', 'Hydraulic fluid', 'coolant', { hrs: 100, months: 24 }, { need: ['AW32 hydraulic fluid (per manual)'], how: 'log splitter hydraulic fluid change' }),
    t('hydfilter', 'Hydraulic filter', 'filter', { hrs: 50, months: 12 }, { need: ['Hydraulic filter'] }),
    t('grease', 'Grease beam & wedge', 'grease', { hrs: 5 }),
    t('hoses', 'Inspect hoses', 'gear', { months: 6 }),
    t('plug', 'Spark plug', 'plug', { hrs: 100, months: 12 }, { need: ['Spark plug'] }),
  ],
  boat: [
    t('oil', 'Engine oil & filter', 'oil', { hrs: 100, months: 12 }, { first: { hrs: 20 }, need: ['Marine engine oil', 'Oil filter'] }),
    t('gearlube', 'Lower unit gear oil', 'gear', { hrs: 100, months: 12 }, { need: ['Gear lube'] }),
    t('impeller', 'Water pump impeller', 'gear', { hrs: 300, months: 36 }, { need: ['Impeller kit'] }),
    t('anodes', 'Anodes check', 'shield', { months: 12 }),
    t('fuelfilter', 'Fuel/water separator', 'fuel', { hrs: 100, months: 12 }),
    t('winter', 'Winterize', 'snow', { months: 12 }),
  ],
  trailer: [
    t('bearings', 'Repack wheel bearings', 'tire', { months: 12 }, { need: ['Bearing grease', 'Seals'] , how: 'repack trailer bearings'}),
    t('tires', 'Tire pressure & lug nuts', 'tire', { months: 1 }),
    t('lights', 'Lights & wiring', 'gear', { months: 3 }),
    t('brakes', 'Brakes / breakaway', 'brake', { months: 12 }),
  ],
  other: [],
};

/* Seasonal checklists, logged as one entry */
const CHECKLISTS = {
  spring: { title: 'Spring start-up', icon: 'calendar', items: ['Charge / reinstall battery', 'Check oil level & condition', 'Fresh fuel', 'Check tire pressure', 'Inspect belts & hoses', 'Sharpen / inspect blades', 'Grease fittings'] },
  winter: { title: 'Winter storage', icon: 'snow', items: ['Add fuel stabilizer & run 5 min (or drain carb)', 'Change oil before storage', 'Clean deck / body', 'Battery on tender or removed', 'Fog cylinder if storing long', 'Cover & store dry'] },
};

const UNIT_LABEL = { mi: 'mi', km: 'km', hrs: 'hrs', none: '' };
