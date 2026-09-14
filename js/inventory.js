/* ============================================================
   inventory.js  -  tiny item bag (NOT an RPG inventory)
   ============================================================ */
export const ITEM_DEFS = {
  llave:    { name: 'Llave oxidada', desc: 'Abre puertas y cofres antiguos.',        color: '#d99a3c', consumable: true },
  lata:     { name: 'Lata',          desc: 'Se lanza para activar botones o distraer.', color: '#d64b3a', consumable: true },
  bombilla: { name: 'Bombilla',      desc: 'Ilumina zonas o activa mecanismos de luz.', color: '#f4c542', consumable: true },
  iman:     { name: 'Imán',          desc: 'Mueve objetos metálicos.',                color: '#4a90d9', consumable: false },
  cuerda:   { name: 'Cuerda',        desc: 'Tiende puentes o activa mecanismos.',     color: '#c9a06a', consumable: true },
};

export const ITEM_ORDER = ['llave', 'lata', 'bombilla', 'iman', 'cuerda'];

export class Inventory {
  constructor() {
    this.items = {};
    this.selected = null;
  }

  add(type, n = 1) {
    this.items[type] = (this.items[type] || 0) + n;
    if (!this.selected || !this.has(this.selected)) this.selected = type;
  }

  has(type) { return (this.items[type] || 0) > 0; }
  count(type) { return this.items[type] || 0; }

  use(type, n = 1) {
    if (!ITEM_DEFS[type] || !ITEM_DEFS[type].consumable) return this.has(type); // reusable tools not spent
    if (!this.has(type)) return false;
    this.items[type] -= n;
    if (this.items[type] <= 0) {
      delete this.items[type];
      if (this.selected === type) this.selected = ITEM_ORDER.find((t) => this.has(t)) || null;
    }
    return true;
  }

  cycle(dir) {
    const owned = ITEM_ORDER.filter((t) => this.has(t));
    if (!owned.length) { this.selected = null; return; }
    let i = owned.indexOf(this.selected);
    if (i < 0) i = 0;
    i = (i + dir + owned.length) % owned.length;
    this.selected = owned[i];
  }

  serialize() { return { ...this.items }; }
  load(obj) {
    this.items = { ...(obj || {}) };
    this.selected = ITEM_ORDER.find((t) => this.has(t)) || null;
  }
}
