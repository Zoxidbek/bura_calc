// Testlar uchun xotiradagi MongoDB o'rinbosari.
// Faqat ilova ishlatadigan operatorlar (MongoDB semantikasi bilan); noma'lum operator — xato,
// shunda kodga qo'llab-quvvatlanmagan narsa qo'shilsa, test darhol ushlaydi.
import { ObjectId } from 'mongodb';

const isOid = v => v instanceof ObjectId;
const isPlain = v => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && !isOid(v) && !(v instanceof RegExp);

function clone(v) {
    if (v instanceof Date) return new Date(v.getTime());
    if (isOid(v)) return new ObjectId(v.toHexString());
    if (Array.isArray(v)) return v.map(clone);
    if (isPlain(v)) {
        const o = {};
        for (const k of Object.keys(v)) if (v[k] !== undefined) o[k] = clone(v[k]);
        return o;
    }
    return v;
}

function eq(a, b) {
    if (isOid(a) || isOid(b)) return isOid(a) && isOid(b) && a.equals(b);
    if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
    if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => eq(x, b[i]));
    if (isPlain(a) && isPlain(b)) {
        const ka = Object.keys(a);
        return ka.length === Object.keys(b).length && ka.every(k => eq(a[k], b[k]));
    }
    return a === b;
}

/** Nuqtali yo'l bo'yicha qiymatlar (massivlar ichiga ham kiradi — MongoDB kabi). */
function valuesAt(doc, path) {
    let cur = [doc];
    for (const part of path.split('.')) {
        const next = [];
        for (const v of cur) {
            if (v === null || v === undefined) {
                next.push(undefined);
            } else if (Array.isArray(v)) {
                if (/^\d+$/.test(part)) next.push(v[Number(part)]);
                else for (const item of v) if (item && typeof item === 'object') next.push(item[part]);
            } else if (typeof v === 'object') {
                next.push(v[part]);
            } else {
                next.push(undefined);
            }
        }
        cur = next;
    }
    return cur;
}

function cmp(a, b) {
    if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
    return null;
}

function expand(values) {
    const out = [];
    for (const v of values) {
        out.push(v);
        if (Array.isArray(v)) out.push(...v);
    }
    return out;
}

function matchEq(values, value) {
    const ex = expand(values);
    if (value === null) return ex.some(v => v === null || v === undefined);
    return ex.some(v => eq(v, value));
}

function matchCond(values, cond) {
    if (isPlain(cond) && Object.keys(cond).some(k => k.startsWith('$'))) {
        const ex = expand(values);
        return Object.entries(cond).every(([op, arg]) => {
            switch (op) {
                case '$eq': return matchEq(values, arg);
                case '$ne': return !matchEq(values, arg);
                case '$in': return arg.some(a => matchEq(values, a));
                case '$nin': return !arg.some(a => matchEq(values, a));
                case '$gt': return ex.some(v => { const c = cmp(v, arg); return c !== null && c > 0; });
                case '$gte': return ex.some(v => { const c = cmp(v, arg); return c !== null && c >= 0; });
                case '$lt': return ex.some(v => { const c = cmp(v, arg); return c !== null && c < 0; });
                case '$lte': return ex.some(v => { const c = cmp(v, arg); return c !== null && c <= 0; });
                case '$exists': return arg ? values.some(v => v !== undefined) : values.every(v => v === undefined);
                case '$regex': {
                    const re = new RegExp(arg, cond.$options || '');
                    return ex.some(v => typeof v === 'string' && re.test(v));
                }
                case '$options': return true;
                default: throw new Error(`fake-db: qo'llab-quvvatlanmagan operator ${op}`);
            }
        });
    }
    return matchEq(values, cond);
}

export function matches(doc, filter = {}) {
    return Object.entries(filter).every(([key, cond]) => {
        if (key === '$or') return cond.some(f => matches(doc, f));
        if (key === '$and') return cond.every(f => matches(doc, f));
        if (key.startsWith('$')) throw new Error(`fake-db: qo'llab-quvvatlanmagan operator ${key}`);
        return matchCond(valuesAt(doc, key), cond);
    });
}

function getPath(doc, path) {
    return path.split('.').reduce((o, p) => (o === null || o === undefined ? undefined : o[p]), doc);
}

function setPath(doc, path, value) {
    const parts = path.split('.');
    let o = doc;
    for (let i = 0; i < parts.length - 1; i++) {
        if (o[parts[i]] === undefined || o[parts[i]] === null) o[parts[i]] = /^\d+$/.test(parts[i + 1]) ? [] : {};
        o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = value;
}

function unsetPath(doc, path) {
    const parts = path.split('.');
    const parent = parts.length > 1 ? getPath(doc, parts.slice(0, -1).join('.')) : doc;
    if (parent && typeof parent === 'object') delete parent[parts[parts.length - 1]];
}

function checkConflicts(update) {
    const paths = [];
    for (const [op, fields] of Object.entries(update)) {
        if (!op.startsWith('$')) throw new Error('fake-db: yangilash faqat operatorlar bilan');
        for (const p of Object.keys(fields)) paths.push(p);
    }
    for (let i = 0; i < paths.length; i++) {
        for (let j = i + 1; j < paths.length; j++) {
            const a = paths[i];
            const b = paths[j];
            if (a === b || a.startsWith(b + '.') || b.startsWith(a + '.')) {
                throw new Error(`fake-db: Updating the path '${a}' would create a conflict at '${b}'`);
            }
        }
    }
}

function applyUpdate(doc, update, isInsert) {
    checkConflicts(update);
    for (const [op, fields] of Object.entries(update)) {
        for (const [p, v] of Object.entries(fields)) {
            switch (op) {
                case '$set': setPath(doc, p, clone(v)); break;
                case '$setOnInsert': if (isInsert) setPath(doc, p, clone(v)); break;
                case '$unset': unsetPath(doc, p); break;
                case '$inc': setPath(doc, p, (getPath(doc, p) || 0) + v); break;
                case '$push': {
                    let arr = getPath(doc, p);
                    if (!Array.isArray(arr)) {
                        arr = [];
                        setPath(doc, p, arr);
                    }
                    if (isPlain(v) && '$each' in v) {
                        arr.push(...v.$each.map(clone));
                        if ('$slice' in v) {
                            const kept = v.$slice < 0 ? arr.slice(v.$slice) : arr.slice(0, v.$slice);
                            arr.splice(0, arr.length, ...kept);
                        }
                    } else {
                        arr.push(clone(v));
                    }
                    break;
                }
                default: throw new Error(`fake-db: qo'llab-quvvatlanmagan yangilash ${op}`);
            }
        }
    }
}

function sortRank(v) {
    if (v === undefined || v === null) return 0;
    if (typeof v === 'number') return 1;
    if (typeof v === 'string') return 2;
    if (isOid(v)) return 7;
    if (typeof v === 'boolean') return 8;
    if (v instanceof Date) return 9;
    return 5;
}

function sortCompare(a, b) {
    const ra = sortRank(a);
    const rb = sortRank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 1 || ra === 9) return a - b;
    if (ra === 2) return a < b ? -1 : a > b ? 1 : 0;
    if (ra === 7) return a.toHexString() < b.toHexString() ? -1 : a.toHexString() > b.toHexString() ? 1 : 0;
    if (ra === 8) return Number(a) - Number(b);
    return 0;
}

class Cursor {
    constructor(docs) {
        this.docs = docs;
        this._sort = null;
        this._skip = 0;
        this._limit = 0;
    }
    sort(spec) { this._sort = spec; return this; }
    skip(n) { this._skip = n; return this; }
    limit(n) { this._limit = n; return this; }
    project() { return this; }
    async toArray() {
        let out = this.docs.slice();
        if (this._sort) {
            const keys = Object.entries(this._sort);
            out.sort((a, b) => {
                for (const [k, dir] of keys) {
                    const c = sortCompare(getPath(a, k), getPath(b, k));
                    if (c !== 0) return c * dir;
                }
                return 0;
            });
        }
        out = out.slice(this._skip, this._limit ? this._skip + this._limit : undefined);
        return out.map(clone);
    }
}

class Collection {
    constructor(name) {
        this.name = name;
        this.docs = [];
        this.unique = [];
    }

    async createIndex(spec, opts = {}) {
        if (opts.unique) this.unique.push(Object.keys(spec));
        return 'ok';
    }

    checkUnique(doc, except) {
        for (const keys of this.unique) {
            const clash = this.docs.find(d => d !== except && keys.every(k => eq(getPath(d, k), getPath(doc, k))));
            if (clash) {
                const err = new Error(`E11000 duplicate key error collection: ${this.name}`);
                err.code = 11000;
                throw err;
            }
        }
    }

    async insertOne(doc) {
        const copy = clone(doc);
        if (copy._id === undefined) copy._id = new ObjectId();
        this.checkUnique(copy);
        this.docs.push(copy);
        doc._id = copy._id;
        return { acknowledged: true, insertedId: copy._id };
    }

    async findOne(filter = {}) {
        const d = this.docs.find(x => matches(x, filter));
        return d ? clone(d) : null;
    }

    find(filter = {}) {
        return new Cursor(this.docs.filter(x => matches(x, filter)));
    }

    async countDocuments(filter = {}) {
        return this.docs.filter(x => matches(x, filter)).length;
    }

    upsertDoc(filter, update) {
        const doc = {};
        for (const [k, v] of Object.entries(filter)) {
            if (!k.startsWith('$') && !(isPlain(v) && Object.keys(v).some(x => x.startsWith('$')))) setPath(doc, k, clone(v));
        }
        applyUpdate(doc, update, true);
        if (doc._id === undefined) doc._id = new ObjectId();
        this.checkUnique(doc);
        this.docs.push(doc);
        return doc;
    }

    async updateOne(filter, update, opts = {}) {
        const d = this.docs.find(x => matches(x, filter));
        if (!d) {
            if (opts.upsert) {
                const doc = this.upsertDoc(filter, update);
                return { matchedCount: 0, modifiedCount: 0, upsertedId: doc._id };
            }
            return { matchedCount: 0, modifiedCount: 0 };
        }
        const before = clone(d);
        applyUpdate(d, update, false);
        this.checkUnique(d, d);
        return { matchedCount: 1, modifiedCount: eq(before, d) ? 0 : 1 };
    }

    async updateMany(filter, update) {
        const list = this.docs.filter(x => matches(x, filter));
        for (const d of list) applyUpdate(d, update, false);
        return { matchedCount: list.length, modifiedCount: list.length };
    }

    async findOneAndUpdate(filter, update, opts = {}) {
        const d = this.docs.find(x => matches(x, filter));
        if (!d) {
            if (!opts.upsert) return null;
            const doc = this.upsertDoc(filter, update);
            return opts.returnDocument === 'after' ? clone(doc) : null;
        }
        const before = clone(d);
        applyUpdate(d, update, false);
        return opts.returnDocument === 'after' ? clone(d) : before;
    }

    async deleteOne(filter) {
        const i = this.docs.findIndex(x => matches(x, filter));
        if (i < 0) return { deletedCount: 0 };
        this.docs.splice(i, 1);
        return { deletedCount: 1 };
    }
}

export function createFakeDb() {
    const store = {
        users: new Collection('users'),
        games: new Collection('games'),
        tracks: new Collection('tracks'),
        settings: new Collection('settings'),
        ping: async () => ({ ok: 1 }),
        close: async () => {}
    };
    return store;
}
