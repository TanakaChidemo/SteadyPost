"use client";

import React from "react";
import { LIMITS } from "../lib/profileOptions";

// Inputs shared by the onboarding wizard and the profile editor. 16px text on
// phones stops iOS zooming into the field; it drops to the app's 12px from sm.
export const inputClass =
  "w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-base sm:text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500";

export function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-300 mb-1">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

/** Multi-select chips; `selected` is a list of option keys. */
export function ChipPicker({ options, selected, onChange, activeClass = "bg-indigo-600 text-white" }) {
  function toggle(key) {
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(({ key, label }) => (
        <button
          type="button"
          key={key}
          onClick={() => toggle(key)}
          aria-pressed={selected.includes(key)}
          className={`px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-md text-xs sm:text-[11px] font-medium transition ${
            selected.includes(key)
              ? activeClass
              : "bg-slate-900 text-slate-400 border border-slate-800 hover:border-slate-700"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function LocationFields({ value, onChange }) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <Field label="Town / City">
        <input
          type="text"
          autoComplete="address-level2"
          maxLength={LIMITS.place}
          placeholder="e.g. Harare"
          value={value.city}
          onChange={set("city")}
          className={inputClass}
        />
      </Field>
      <Field label="Region">
        <input
          type="text"
          autoComplete="address-level1"
          maxLength={LIMITS.place}
          placeholder="e.g. Mashonaland"
          value={value.region}
          onChange={set("region")}
          className={inputClass}
        />
      </Field>
      <Field label="Country">
        <input
          type="text"
          autoComplete="country-name"
          maxLength={LIMITS.place}
          placeholder="e.g. Zimbabwe"
          value={value.country}
          onChange={set("country")}
          className={inputClass}
        />
      </Field>
      <div className="sm:col-span-3">
        <Field label="Area you serve" hint="Where your customers are, if wider than your town (e.g. nationwide, online).">
          <input
            type="text"
            maxLength={LIMITS.serviceArea}
            placeholder="e.g. Greater Harare, or ships nationwide"
            value={value.serviceArea}
            onChange={set("serviceArea")}
            className={inputClass}
          />
        </Field>
      </div>
    </div>
  );
}
