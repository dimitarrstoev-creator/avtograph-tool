import useSharedAppointments from "./hooks/useSharedAppointmentsFirebase";
import useSharedConfig from "./hooks/useSharedConfigFirebase";
import React, { useEffect, useMemo, useState } from "react";

/**
 * Avtograph Internal Tool — v6
 * + True package list, add-ons, and per-car-type pricing editor
 * + Estimator uses pricing matrix (package + add-ons) by car type
 * + Keeps bookings, timeline, CSV, bays, dark mode from v5
 */

const LS_KEY = "avtograph_tool_v6";

/* ------------------ State hook ------------------ */
function useLocalState(initial) {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? { ...initial, ...JSON.parse(raw) } : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => localStorage.setItem(LS_KEY, JSON.stringify(state)), [state]);
  return [state, setState];
}

/* ------------------ Theme helpers ------------------ */
const pkgBadge = (id) =>
  ({
    interior: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800",
    exterior: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-800",
    full: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-200 dark:border-indigo-800",
    two_step: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800",
    one_step: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-900/30 dark:text-fuchsia-200 dark:border-fuchsia-800",
  }[id] || "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700");

/* ------------------ Defaults ------------------ */
const defaultData = {
  ui: { tab: "appointments", dark: false, settingsTab: "pricing" }, // tabs: estimator | appointments | settings; settings subtab: pricing | shop
  settings: {
    currency: "лв",
    hourlyRate: 60,
    materialsMargin: 0.3,
    openHour: 9,
    closeHour: 19,
    slotMinutes: 30,
    bays: 1,
  },

  /* Car types you can fully edit in Settings → Packages & Prices */
  carTypes: [
    { id: "S", name: "Small (A3/Golf)" },
    { id: "M", name: "Medium (3-Series/C-Class)" },
    { id: "L", name: "Large (5-Series/E-Class)" },
    { id: "SUV", name: "SUV/Van" },
  ],

  /* Packages with price per car type */
  packages: [
    {
      id: "interior",
      name: "Interior Detail",
      durationMin: 120,
      prices: { S: 160, M: 180, L: 200, SUV: 220 },
    },
    {
      id: "exterior",
      name: "Exterior Detail",
      durationMin: 120,
      prices: { S: 160, M: 180, L: 200, SUV: 220 },
    },
    {
      id: "full",
      name: "Interior/Exterior Detail",
      durationMin: 240,
      prices: { S: 300, M: 340, L: 380, SUV: 420 },
    },
    {
      id: "two_step",
      name: "Two Step Polishing + Full Detail",
      durationMin: 420,
      prices: { S: 700, M: 780, L: 860, SUV: 940 },
    },
    {
      id: "one_step",
      name: "One Step Polishing + Full Detail",
      durationMin: 300,
      prices: { S: 480, M: 540, L: 600, SUV: 660 },
    },
  ],

  /* Add-ons with price per car type */
  addons: [
    {
      id: "ceramic",
      name: "Ceramic Coating",
      durationMin: 90,
      prices: { S: 350, M: 380, L: 420, SUV: 460 },
    },
    {
      id: "wax",
      name: "Wax",
      durationMin: 30,
      prices: { S: 60, M: 70, L: 80, SUV: 90 },
    },
    {
      id: "sealant",
      name: "Window Sealant",
      durationMin: 20,
      prices: { S: 40, M: 50, L: 60, SUV: 70 },
    },
  ],

  /* Bookings */
  appointments: [], // {id,name,email,pkgId,startISO,endISO,note,addonIds[]}
};

/* ------------------ Utils ------------------ */
const ymd = (d) => new Date(d).toISOString().slice(0, 10);
const startOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const addMinutes = (iso, m) => {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() + m);
  return d.toISOString();
};
const overlap = (a1, a2, b1, b2) => new Date(a1) < new Date(b2) && new Date(b1) < new Date(a2);
const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/* ------------------ Shared Card ------------------ */
function Card({ title, actions, children }) {
  return (
    <section className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm ring-1 ring-slate-200 dark:ring-slate-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h2>
        <div className="flex gap-2">{actions}</div>
      </div>
      {children}
    </section>
  );
}

/* =========================================================
   ESTIMATOR — now uses pricing matrix by car type + add-ons
   ========================================================= */
function Estimator({ data }) {
  const [carTypeId, setCarTypeId] = useState("M");
  const [pkgId, setPkgId] = useState("");
  const [addonIds, setAddonIds] = useState([]);

  const pkg = data.packages.find((p) => p.id === pkgId);
  const addOnMap = useMemo(() => {
    const m = new Map();
    data.addons.forEach((a) => m.set(a.id, a));
    return m;
  }, [data.addons]);

  const total = useMemo(() => {
    if (!pkg || !carTypeId) return null;
    const base = Number(pkg.prices?.[carTypeId] || 0);
    const addOns = addonIds.reduce((s, id) => s + Number(addOnMap.get(id)?.prices?.[carTypeId] || 0), 0);
    const duration =
      Number(pkg.durationMin || 0) +
      addonIds.reduce((s, id) => s + Number(addOnMap.get(id)?.durationMin || 0), 0);
    return { base, addOns, total: base + addOns, duration };
  }, [pkg, addonIds, addOnMap, carTypeId]);

  function toggleAddon(id, checked) {
    setAddonIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  }

  return (
    <Card title="Estimator">
      <div className="grid md:grid-cols-3 gap-6">
        <div>
          <label className="block text-sm font-medium mb-1">Car type</label>
          <select
            className="w-full p-2.5 border rounded-xl bg-white dark:bg-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
            value={carTypeId}
            onChange={(e) => setCarTypeId(e.target.value)}
          >
            {data.carTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Package</label>
          <select
            className="w-full p-2.5 border rounded-xl bg-white dark:bg-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
            value={pkgId}
            onChange={(e) => {
              setPkgId(e.target.value);
              setAddonIds([]);
            }}
          >
            <option value="">Select package</option>
            {data.packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Add-ons</label>
          {pkg ? (
            <div className="flex flex-col gap-1.5">
              {data.addons.map((a) => (
                <label key={a.id} className="text-sm">
                  <input
                    type="checkbox"
                    className="mr-2 accent-black"
                    checked={addonIds.includes(a.id)}
                    onChange={(e) => toggleAddon(a.id, e.target.checked)}
                  />
                  {a.name} — {a.prices?.[carTypeId] ?? 0} {data.settings.currency}
                </label>
              ))}
            </div>
          ) : (
            <div className="text-slate-500 text-sm">Select package first</div>
          )}
        </div>
      </div>

      {total && (
        <div className="mt-6 grid sm:grid-cols-4 gap-4">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">Package</div>
            <div className="text-lg font-semibold">
              {total.base.toFixed(2)} {data.settings.currency}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">Add-ons</div>
            <div className="text-lg font-semibold">
              {total.addOns.toFixed(2)} {data.settings.currency}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">Duration</div>
            <div className="text-lg font-semibold">{total.duration} min</div>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-4">
            <div className="text-xs text-slate-500 dark:text-slate-400">Total</div>
            <div className="text-lg font-semibold">
              {total.total.toFixed(2)} {data.settings.currency}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

/* =========================================================
   APPOINTMENTS (same UX as your v5, but understands add-ons)
   ========================================================= */
function Appointments({ data, setData }) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(ymd(new Date()));
  const [form, setForm] = useState({
    name: "",
    email: "",
    pkgId: "",
    startISO: "",
    durationMin: "",
    note: "",
    addonIds: [],
  });
  const [edit, setEdit] = useState(null);

  const packagesById = useMemo(() => {
    const m = new Map();
    data.packages.forEach((p) => m.set(p.id, p));
    return m;
  }, [data.packages]);

  const addonsById = useMemo(() => {
    const m = new Map();
    data.addons.forEach((a) => m.set(a.id, a));
    return m;
  }, [data.addons]);

  const days = useMemo(() => {
    const s = startOfMonth(month);
    const e = endOfMonth(month);
    const list = [];
    const lead = (s.getDay() + 6) % 7;
    for (let i = 0; i < lead; i++) list.push(null);
    for (let d = 1; d <= e.getDate(); d++) list.push(new Date(month.getFullYear(), month.getMonth(), d));
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [month]);

  const apptsByDay = useMemo(() => {
    const m = new Map();
    data.appointments.forEach((a) => {
      const key = ymd(a.startISO);
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(a);
    });
    for (const arr of m.values()) arr.sort((x, y) => new Date(x.startISO) - new Date(y.startISO));
    return m;
  }, [data.appointments]);

  /* ---- timeline ---- */
  const slots = useMemo(() => {
    const res = [];
    const { openHour, closeHour, slotMinutes } = data.settings;
    const d = new Date(selectedDay + "T00:00:00");
    const start = new Date(d); start.setHours(openHour, 0, 0, 0);
    const end = new Date(d); end.setHours(closeHour, 0, 0, 0);
    for (let t = new Date(start); t < end; t.setMinutes(t.getMinutes() + slotMinutes)) {
      const iso = new Date(t).toISOString();
      const isoEnd = addMinutes(iso, slotMinutes);
      const count = (apptsByDay.get(selectedDay) || []).filter(a => overlap(a.startISO, a.endISO, iso, isoEnd)).length;
      res.push({ iso, end: isoEnd, count });
    }
    return res;
  }, [selectedDay, data.settings, apptsByDay]);

  function changeMonth(delta) {
    const x = new Date(month);
    x.setMonth(x.getMonth() + delta);
    setMonth(new Date(x.getFullYear(), x.getMonth(), 1));
  }

  function canAdd(startISO, endISO, ignoreId = null) {
    const same = (apptsByDay.get(ymd(startISO)) || []).filter(a => !ignoreId || a.id !== ignoreId);
    const overlapping = same.filter(a => overlap(a.startISO, a.endISO, startISO, endISO)).length;
    return overlapping < (data.settings.bays || 1);
  }

  function addAppointment(e) {
    e.preventDefault();
    if (!form.name || !form.email || !form.pkgId || !form.startISO) return;

    const pkg = packagesById.get(form.pkgId);
    const dur =
      Number(form.durationMin) > 0
        ? Number(form.durationMin)
        : (pkg?.durationMin || 60) +
          (form.addonIds || []).reduce((s, id) => s + Number(addonsById.get(id)?.durationMin || 0), 0);

    const endISO = addMinutes(form.startISO, dur);
    if (!canAdd(form.startISO, endISO)) {
      alert("This time exceeds available bays.");
      return;
    }

    const appt = {
      id: crypto.randomUUID(),
      name: form.name.trim(),
      email: form.email.trim(),
      pkgId: form.pkgId,
      addonIds: [...(form.addonIds || [])],
      startISO: form.startISO,
      endISO,
      note: form.note.trim(),
    };
    setData({ ...data, appointments: [...data.appointments, appt] });
    setSelectedDay(ymd(form.startISO));
    setForm({ name: "", email: "", pkgId: "", startISO: "", durationMin: "", note: "", addonIds: [] });
  }

  function removeAppointment(id) {
    if (!confirm("Delete this appointment?")) return;
    setData({ ...data, appointments: data.appointments.filter((a) => a.id !== id) });
    setEdit(null);
  }

  function saveEdit() {
    if (!edit) return;
    if (!canAdd(edit.startISO, edit.endISO, edit.id)) {
      alert("This time exceeds available bays.");
      return;
    }
    setData({
      ...data,
      appointments: data.appointments.map((a) => (a.id === edit.id ? edit : a)),
    });
    setEdit(null);
  }

  const listForDay = apptsByDay.get(selectedDay) || [];
  const clients = useMemo(() => {
    const m = new Map();
    data.appointments.forEach((a) => {
      if (!m.has(a.email)) m.set(a.email, { name: a.name, email: a.email });
    });
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [data.appointments]);

  return (
    <Card
      title="Appointments"
      actions={
        <div className="flex items-center gap-2">
          <button className="px-3 py-1.5 rounded-xl border hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => changeMonth(-1)}>←</button>
          <div className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {month.toLocaleString(undefined, { month: "long", year: "numeric" })}
          </div>
          <button className="px-3 py-1.5 rounded-xl border hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => changeMonth(1)}>→</button>
        </div>
      }
    >
      <div className="grid xl:grid-cols-3 gap-8">
        {/* Calendar */}
        <div className="xl:col-span-2">
          <div className="grid grid-cols-7 text-[11px] text-slate-500 dark:text-slate-400 mb-1">
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((w) => <div key={w} className="px-2 py-1">{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((d, i) => {
              if (!d) return <div key={i} className="aspect-square rounded-xl" />;
              const key = ymd(d);
              const isToday = key === ymd(new Date());
              const isSel = key === selectedDay;
              const dayAppts = apptsByDay.get(key) || [];
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(key)}
                  className={
                    "aspect-square rounded-xl border p-2 text-left transition " +
                    (isSel ? "border-black dark:border-white shadow-sm" : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600")
                  }
                >
                  <div className="flex items-center gap-2">
                    <div className={"text-sm font-semibold " + (isToday ? "text-black dark:text-white" : "text-slate-800 dark:text-slate-200")}>
                      {d.getDate()}
                    </div>
                    {isToday && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-black text-white">Today</span>}
                  </div>

                  <div className="mt-2 flex flex-col gap-1">
                    {dayAppts.slice(0, 3).map((a) => (
                      <div
                        key={a.id}
                        className={`text-[11px] truncate border rounded px-1.5 py-0.5 ${pkgBadge(a.pkgId)}`}
                        title={`${fmtTime(a.startISO)}–${fmtTime(a.endISO)} • ${a.name}`}
                      >
                        {fmtTime(a.startISO)} · {a.name}
                      </div>
                    ))}
                    {dayAppts.length > 3 && <div className="text-[11px] text-slate-500 dark:text-slate-400">+ {dayAppts.length - 3} more…</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Day panel */}
        <div className="xl:col-span-1">
          <div className="mb-3 text-sm text-slate-600 dark:text-slate-300">
            Selected day: <span className="font-medium">{selectedDay}</span> · Bays: <span className="font-medium">{data.settings.bays}</span>
          </div>

          {/* Timeline */}
          <div className="mb-5 max-h-[320px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
            {(() => {
              const { openHour, closeHour, slotMinutes } = data.settings;
              const d = new Date(selectedDay + "T00:00:00");
              const start = new Date(d); start.setHours(openHour, 0, 0, 0);
              const end = new Date(d); end.setHours(closeHour, 0, 0, 0);
              const out = [];
              for (let t = new Date(start); t < end; t.setMinutes(t.getMinutes() + slotMinutes)) {
                const iso = new Date(t).toISOString();
                const isoEnd = addMinutes(iso, slotMinutes);
                const count = (apptsByDay.get(selectedDay) || []).filter(a => overlap(a.startISO, a.endISO, iso, isoEnd)).length;
                out.push(
                  <div key={iso} className="flex items-center justify-between px-3 py-2 text-sm border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-700 dark:text-slate-200">{fmtTime(iso)}</span>
                    <span className={"text-xs px-2 py-0.5 rounded-full " + (count >= (data.settings.bays || 1) ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200")}>
                      {count}/{data.settings.bays}
                    </span>
                  </div>
                );
              }
              return out;
            })()}
          </div>

          {/* Add form */}
          <form onSubmit={addAppointment} className="space-y-3 mb-6">
            <div>
              <label className="text-sm font-medium">Name</label>
              <input className="w-full border rounded-xl p-2.5 bg-white dark:bg-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
                value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <input type="email" className="w-full border rounded-xl p-2.5 bg-white dark:bg-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
                value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div>
              <label className="text-sm font-medium">Package</label>
              <select className="w-full border rounded-xl p-2.5 bg-white dark:bg-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
                value={form.pkgId} onChange={(e) => setForm({ ...form, pkgId: e.target.value })} required>
                <option value="">Select package</option>
                {data.packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Add-ons</label>
              <div className="flex flex-col gap-1.5">
                {data.addons.map((a) => (
                  <label key={a.id} className="text-sm">
                    <input
                      type="checkbox"
                      className="mr-2 accent-black"
                      checked={form.addonIds?.includes(a.id) || false}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          addonIds: e.target.checked
                            ? [...(prev.addonIds || []), a.id]
                            : (prev.addonIds || []).filter((x) => x !== a.id),
                        }))
                      }
                    />
                    {a.name}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Start (date & time)</label>
              <input type="datetime-local" className="w-full border rounded-xl p-2.5 bg-white dark:bg-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
                value={form.startISO} onChange={(e) => setForm({ ...form, startISO: e.target.value })} required />
            </div>
            <div>
              <label className="text-sm font-medium">Duration override (min) <span className="text-slate-400">(optional)</span></label>
              <input type="number" min="1" className="w-full border rounded-xl p-2.5 bg-white dark:bg-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
                value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Note</label>
              <input className="w-full border rounded-xl p-2.5 bg-white dark:bg-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
                value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
            <button className="w-full bg-black text-white rounded-xl p-2.5 hover:bg-black/90">Add Appointment</button>
          </form>

          {/* Day list */}
          <div className="font-semibold mb-2">Appointments on {selectedDay}</div>
          {listForDay.length === 0 && <div className="text-sm text-slate-500 dark:text-slate-400">No appointments.</div>}
          <ul className="space-y-2">
            {listForDay.map((a) => (
              <li key={a.id} className="border rounded-xl p-3 border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">
                    {fmtTime(a.startISO)}–{fmtTime(a.endISO)} · {a.name}
                  </div>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full border ${pkgBadge(a.pkgId)}`}>
                    {data.packages.find((p) => p.id === a.pkgId)?.name}
                  </span>
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  {a.email}
                  {a.addonIds?.length ? ` · Add-ons: ${a.addonIds.map((id) => data.addons.find((x) => x.id === id)?.name).join(", ")}` : ""}
                  {a.note ? ` · ${a.note}` : ""}
                </div>
                <div className="mt-2 flex gap-2">
                  <button className="text-xs px-2 py-1 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => setEdit({ ...a })}>Edit</button>
                  <button className="text-xs px-2 py-1 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => removeAppointment(a.id)}>Delete</button>
                </div>
              </li>
            ))}
          </ul>

          {/* Edit modal */}
          {edit && (
            <div className="fixed inset-0 z-20 bg-black/40 flex items-center justify-center p-4">
              <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl p-5 ring-1 ring-slate-200 dark:ring-slate-700">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-base font-semibold">Edit appointment</div>
                  <button className="px-2 py-1 border rounded-lg" onClick={() => setEdit(null)}>✕</button>
                </div>
                <div className="grid sm:grid-cols-2 gap-3 mb-4">
                  <input className="border rounded-lg p-2 bg-white dark:bg-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
                    value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                  <input className="border rounded-lg p-2 bg-white dark:bg-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
                    value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
                  <select className="border rounded-lg p-2 bg-white dark:bg-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
                    value={edit.pkgId} onChange={(e) => setEdit({ ...edit, pkgId: e.target.value })}>
                    {data.packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input type="datetime-local" className="border rounded-lg p-2 bg-white dark:bg-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
                    value={edit.startISO} onChange={(e) => {
                      const s = e.target.value;
                      const dur = (new Date(edit.endISO) - new Date(edit.startISO)) / 60000;
                      setEdit({ ...edit, startISO: s, endISO: addMinutes(s, Math.max(1, dur)) });
                    }} />
                  <input type="datetime-local" className="border rounded-lg p-2 bg-white dark:bg-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
                    value={edit.endISO} onChange={(e) => setEdit({ ...edit, endISO: e.target.value })} />
                  <input className="border rounded-lg p-2 bg-white dark:bg-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
                    value={edit.note || ""} onChange={(e) => setEdit({ ...edit, note: e.target.value })} placeholder="Note" />
                </div>
                <div className="mb-3">
                  <div className="text-sm font-medium mb-1">Add-ons</div>
                  <div className="flex flex-col gap-1.5">
                    {data.addons.map((a) => (
                      <label key={a.id} className="text-sm">
                        <input
                          type="checkbox"
                          className="mr-2 accent-black"
                          checked={edit.addonIds?.includes(a.id) || false}
                          onChange={(e) =>
                            setEdit((prev) => ({
                              ...prev,
                              addonIds: e.target.checked
                                ? [...(prev.addonIds || []), a.id]
                                : (prev.addonIds || []).filter((x) => x !== a.id),
                            }))
                          }
                        />
                        {a.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button className="px-3 py-1.5 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => removeAppointment(edit.id)}>Delete</button>
                  <button className="px-3 py-1.5 bg-black text-white rounded-lg hover:bg-black/90" onClick={saveEdit}>Save</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/* =========================================================
   SETTINGS — new "Packages & Prices" editor (car types, packages, add-ons)
   ========================================================= */
function Settings({ data, setData }) {
  const { settingsTab = "pricing" } = data.ui || {};
  function setTab(t) {
    setData({ ...data, ui: { ...data.ui, settingsTab: t } });
  }

  /* --- Small helpers to update arrays immutably --- */
  const upCar = (idx, field, value) => {
    const next = [...data.carTypes];
    next[idx] = { ...next[idx], [field]: value };
    setData({ ...data, carTypes: next });
  };
  const addCar = () => {
    const id = prompt("New car type ID (short, e.g. XL):");
    const name = id ? prompt("Display name:") : null;
    if (id && name) setData({ ...data, carTypes: [...data.carTypes, { id, name }] });
  };
  const delCar = (idx) => {
    const id = data.carTypes[idx].id;
    if (!confirm(`Delete car type ${id}?`)) return;
    // Also strip from price matrices
    const nextPkgs = data.packages.map((p) => {
      const { [id]: _, ...rest } = p.prices || {};
      return { ...p, prices: rest };
    });
    const nextAdds = data.addons.map((a) => {
      const { [id]: _, ...rest } = a.prices || {};
      return { ...a, prices: rest };
    });
    const nextCars = data.carTypes.filter((_, i) => i !== idx);
    setData({ ...data, carTypes: nextCars, packages: nextPkgs, addons: nextAdds });
  };

  const upPkgName = (i, name) => {
    const pkgs = [...data.packages];
    pkgs[i] = { ...pkgs[i], name };
    setData({ ...data, packages: pkgs });
  };
  const upPkgDur = (i, min) => {
    const pkgs = [...data.packages];
    pkgs[i] = { ...pkgs[i], durationMin: Number(min) || 0 };
    setData({ ...data, packages: pkgs });
  };
  const upPkgPrice = (i, carId, val) => {
    const pkgs = [...data.packages];
    pkgs[i] = { ...pkgs[i], prices: { ...(pkgs[i].prices || {}), [carId]: Number(val) || 0 } };
    setData({ ...data, packages: pkgs });
  };

  const upAddName = (i, name) => {
    const adds = [...data.addons];
    adds[i] = { ...adds[i], name };
    setData({ ...data, addons: adds });
  };
  const upAddDur = (i, min) => {
    const adds = [...data.addons];
    adds[i] = { ...adds[i], durationMin: Number(min) || 0 };
    setData({ ...data, addons: adds });
  };
  const upAddPrice = (i, carId, val) => {
    const adds = [...data.addons];
    adds[i] = { ...adds[i], prices: { ...(adds[i].prices || {}), [carId]: Number(val) || 0 } };
    setData({ ...data, addons: adds });
  };

  return (
    <Card
      title="Settings"
      actions={
        <div className="flex gap-2">
          <button onClick={() => setTab("pricing")} className={"px-3 py-1.5 rounded-xl border " + (settingsTab === "pricing" ? "bg-black text-white border-black" : "")}>
            Packages & Prices
          </button>
          <button onClick={() => setTab("shop")} className={"px-3 py-1.5 rounded-xl border " + (settingsTab === "shop" ? "bg-black text-white border-black" : "")}>
            Business
          </button>
        </div>
      }
    >
      {settingsTab === "shop" && (
        <div className="grid md:grid-cols-3 gap-6">
          <Field label="Hourly rate">
            <NumberInput
              value={data.settings.hourlyRate}
              onChange={(v) => setData({ ...data, settings: { ...data.settings, hourlyRate: v } })}
            />
          </Field>
          <Field label="Material margin (%)">
            <NumberInput
              value={Math.round(data.settings.materialsMargin * 100)}
              onChange={(v) => setData({ ...data, settings: { ...data.settings, materialsMargin: v / 100 } })}
            />
          </Field>
          <Field label="Currency">
            <TextInput
              value={data.settings.currency}
              onChange={(v) => setData({ ...data, settings: { ...data.settings, currency: v } })}
            />
          </Field>
          <Field label="Open hour (0–23)">
            <NumberInput
              value={data.settings.openHour}
              onChange={(v) => setData({ ...data, settings: { ...data.settings, openHour: v } })}
            />
          </Field>
          <Field label="Close hour (0–23)">
            <NumberInput
              value={data.settings.closeHour}
              onChange={(v) => setData({ ...data, settings: { ...data.settings, closeHour: v } })}
            />
          </Field>
          <Field label="Slot length (minutes)">
            <NumberInput
              value={data.settings.slotMinutes}
              onChange={(v) => setData({ ...data, settings: { ...data.settings, slotMinutes: v } })}
            />
          </Field>
          <Field label="Bays (parallel jobs)">
            <NumberInput
              value={data.settings.bays}
              onChange={(v) => setData({ ...data, settings: { ...data.settings, bays: v } })}
            />
          </Field>
        </div>
      )}

      {settingsTab === "pricing" && (
        <div className="space-y-8">
          {/* Car Types */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold">Car Types</h3>
              <button className="px-2.5 py-1.5 border rounded-lg" onClick={addCar}>Add car type</button>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {data.carTypes.map((t, i) => (
                <div key={t.id} className="flex gap-2 items-center border rounded-xl p-3">
                  <div className="w-24">
                    <label className="text-xs text-slate-500">ID</label>
                    <TextInput value={t.id} onChange={(v) => upCar(i, "id", v)} />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-slate-500">Name</label>
                    <TextInput value={t.name} onChange={(v) => upCar(i, "name", v)} />
                  </div>
                  <button className="px-2 py-1 border rounded-lg" onClick={() => delCar(i)}>Delete</button>
                </div>
              ))}
            </div>
          </div>

          {/* Packages */}
          <div>
            <h3 className="font-semibold mb-2">Packages</h3>
            <div className="space-y-3">
              {data.packages.map((p, i) => (
                <div key={p.id} className="border rounded-2xl p-4">
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${pkgBadge(p.id)}`}>{p.name}</span>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500">Name</label>
                      <TextInput value={p.name} onChange={(v) => upPkgName(i, v)} />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500">Duration (min)</label>
                      <NumberInput value={p.durationMin} onChange={(v) => upPkgDur(i, v)} />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-4 gap-3">
                    {data.carTypes.map((t) => (
                      <div key={t.id}>
                        <label className="text-xs text-slate-500">{t.name}</label>
                        <NumberInput value={Number(p.prices?.[t.id] || 0)} onChange={(v) => upPkgPrice(i, t.id, v)} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Add-ons */}
          <div>
            <h3 className="font-semibold mb-2">Add-ons</h3>
            <div className="space-y-3">
              {data.addons.map((a, i) => (
                <div key={a.id} className="border rounded-2xl p-4">
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <span className="text-[11px] px-2 py-0.5 rounded-full border bg-slate-50 dark:bg-slate-800">
                      {a.name}
                    </span>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500">Name</label>
                      <TextInput value={a.name} onChange={(v) => upAddName(i, v)} />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-slate-500">Duration (min)</label>
                      <NumberInput value={a.durationMin} onChange={(v) => upAddDur(i, v)} />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-4 gap-3">
                    {data.carTypes.map((t) => (
                      <div key={t.id}>
                        <label className="text-xs text-slate-500">{t.name}</label>
                        <NumberInput value={Number(a.prices?.[t.id] || 0)} onChange={(v) => upAddPrice(i, t.id, v)} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ---- Tiny input components ---- */
function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      {children}
    </div>
  );
}
function TextInput({ value, onChange }) {
  return (
    <input
      className="w-full border p-2.5 rounded-xl bg-white dark:bg-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
function NumberInput({ value, onChange }) {
  return (
    <input
      type="number"
      className="w-full border p-2.5 rounded-xl bg-white dark:bg-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-700"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

/* =========================================================
   APP SHELL (tabs + dark mode)
   ========================================================= */
function App() {
  const [data, setData] = useLocalState(defaultData);
  const { tab, dark } = data.ui;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", !!dark);
  }, [dark]);

  const setTab = (t) => setData({ ...data, ui: { ...data.ui, tab: t } });
  const toggleDark = () => setData({ ...data, ui: { ...data.ui, dark: !dark } });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <header className="sticky top-0 z-10 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-black" />
            <div className="text-lg font-semibold tracking-tight">Avtograph Internal Tool</div>
          </div>
          <nav className="flex items-center gap-2">
            {["estimator","appointments","settings"].map((t) => (
              <button
                key={t}
                className={"px-3.5 py-2 text-sm rounded-xl border transition " + (tab === t ? "bg-black text-white border-black" : "bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700")}
                onClick={() => setTab(t)}
              >
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
            <button
              className="ml-3 px-3.5 py-2 text-sm rounded-xl border bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700"
              onClick={toggleDark}
            >
              {dark ? "Light" : "Dark"}
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {tab === "estimator" && <Estimator data={data} />}
        {tab === "appointments" && <Appointments data={data} setData={setData} />}
        {tab === "settings" && <Settings data={data} setData={setData} />}
      </main>
    </div>
  );
}

export default App;