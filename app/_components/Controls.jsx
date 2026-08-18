"use client";

// Renders the control SPECS a game descriptor declares (src/ui/controls.js) as React.
//
// The descriptors no longer emit markup, so this file is the only thing that knows what a "tally"
// or a "list" looks like — swap it and the games are untouched.
//
// Two details here are load-bearing rather than incidental:
//
// 1. A tally BUTTON's content is entirely static — the token art is a pure function of
//    (kind, height), and the pip is a printed rule constant. So it is injected once as an SVG
//    string and never re-rendered. The button element therefore survives every state change, which
//    is what keeps `:active` alive under a moving finger. That property is why `patchScores()`
//    existed in the vanilla app; here React's own diffing provides it, as long as we don't rebuild
//    the node.
// 2. The minus is `disabled` at the floor, never hidden — a control that appears on first tap
//    reflows the row mid-press (CLAUDE.md, "Controls keep their place").

import { useState, useRef, useEffect } from "react";
import { tokenArt, escapeAttr } from "@/src/ui/controls.js";
import { numOf } from "@/src/scoring.js";

function tallyButtonHtml(spec){
  const art = typeof spec.art === "function" ? spec.art() : tokenArt(spec.art, spec.height);
  const badge = spec.pip != null
    ? `<span class="pip">${escapeAttr(spec.pip)}</span>`
    : `<span class="tally-cap">${escapeAttr(spec.cap)}</span>`;
  return art + badge;
}

// The count chip swaps for a text field in place. Nothing around it rebuilds: if this re-rendered
// the whole category, a tap on a token while the field was focused would blur it, destroy the
// token and lose the tap.
function CountChip({ spec, onCommit }){
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);
  const committed = useRef(false);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
    // If focus did not really take, blur never fires and the field is stranded — losing the only
    // way back to a chip. focus() still sets activeElement on an unfocused document, so check
    // hasFocus() too.
    if (!document.hasFocus() || document.activeElement !== el) close(el.value);
  }, [editing]);

  function close(raw){
    if (committed.current) return;
    committed.current = true;
    onCommit(Math.max(spec.min, Math.trunc(numOf(raw))));
    setEditing(false);
  }

  if (editing){
    return (
      <input
        ref={inputRef}
        type="number"
        min={spec.min}
        inputMode="numeric"
        className="count-input"
        defaultValue={spec.count}
        onBlur={e => close(e.target.value)}
        // Some mobile keyboards commit without ever firing blur.
        onChange={e => { if (e.nativeEvent.inputType === undefined) close(e.target.value); }}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === "Escape"){
            e.preventDefault();
            close(e.target.value);
          }
        }}
      />
    );
  }

  return (
    <button
      className="count-chip"
      aria-label={`${spec.label} — tap to type the count`}
      onClick={() => { committed.current = false; setEditing(true); }}
    >
      <span className="count-pre">{spec.prefix}</span>
      <span className="count-num">{spec.count}</span>
    </button>
  );
}

// spec.bigStep is an optional coarse jump (Treasury's coins, Harmonies' river length, the h1
// stack) alongside the always-present ±1/type modes — never a replacement for them, matching the
// Fame stepper it was generalized from (Scorer.jsx's FameStepper). Biggest jump sits outermost:
// [-bigStep] [count chip] [minus(-1)] [+bigStep], flanking the existing pair rather than
// interrupting it, so the count-chip/minus relationship a user already knows doesn't move.
function Tally({ spec, on }){
  return (
    <div className="tally">
      <button
        className="tally-btn"
        aria-label={spec.label}
        onClick={() => on.bump(spec, 1)}
        dangerouslySetInnerHTML={{ __html: tallyButtonHtml(spec) }}
      />
      <div className="tally-count">
        {spec.bigStep ? (
          <button
            className="step-btn wide"
            disabled={spec.count <= spec.min}
            aria-label={`Remove ${spec.bigStep}`}
            onClick={() => on.bump(spec, -spec.bigStep)}
          >−{spec.bigStep}</button>
        ) : null}
        <CountChip spec={spec} onCommit={v => on.setCount(spec, v)} />
        <button
          className="minus"
          disabled={spec.count <= spec.min}
          aria-label="Remove one"
          onClick={() => on.bump(spec, -1)}
        >−</button>
        {spec.bigStep ? (
          <button
            className="step-btn wide"
            aria-label={`Add ${spec.bigStep}`}
            onClick={() => on.bump(spec, spec.bigStep)}
          >+{spec.bigStep}</button>
        ) : null}
      </div>
    </div>
  );
}

// One tap toggles p[path][key] between 0 and 1 via the same setCount action every tally already
// uses — see checkChip()'s comment in src/ui/controls.js for why no new reducer case was needed.
function CheckChip({ spec, on }){
  return (
    <button
      type="button"
      className={"check-chip" + (spec.checked ? " on" : "")}
      aria-pressed={spec.checked}
      aria-label={spec.label}
      onClick={() => on.setCount(spec, spec.checked ? 0 : 1)}
    >
      <span className="check-chip-name">{spec.name}</span>
      <span className="pip">{spec.pip}</span>
    </button>
  );
}

function CheckGroup({ spec, on }){
  return (
    <div className="check-group">
      {spec.items.map((c, i) => <CheckChip spec={c} on={on} key={c.path + ":" + c.key + i} />)}
    </div>
  );
}

function Ladder({ spec, active }){
  return (
    <div className="ladder">
      {spec.rungs.map(r => (
        <span key={r.value} className={"rung" + (r.value === active ? " on" : "")}>{r.text}</span>
      ))}
    </div>
  );
}

function NumberList({ spec, on }){
  return (
    <div className="animal-list">
      {spec.values.map((v, i) => (
        <div className="animal-row" key={i}>
          <input
            className={spec.inputClass || undefined}
            type="number"
            min={spec.min}
            inputMode={spec.inputmode || undefined}
            value={v}
            data-uid={spec.uidFor(i)}
            onChange={e => on.listInput(spec.cat, i, e.target.value)}
          />
          {spec.rowHint ? <span className="cat-hint" style={{ margin: 0 }}>{spec.rowHint}</span> : null}
          {spec.showRemove
            ? <button aria-label={spec.removeAriaLabel || undefined} onClick={() => on.listRemove(spec.cat, i)}>✕</button>
            : null}
        </div>
      ))}
      <button className="add-btn" onClick={() => on.listAdd(spec.cat)}>{spec.addLabel}</button>
    </div>
  );
}

function NumField({ spec, on }){
  const input = (
    <input
      className="num-input"
      type="number"
      min={spec.min}
      inputMode="numeric"
      value={spec.value}
      placeholder={spec.placeholder}
      data-uid={spec.uid}
      onChange={e => on.numInput(spec.cat, e.target.value)}
    />
  );
  return spec.subrow ? <div className="subrow">{input}</div> : input;
}

// `activeRung` is read off the descriptor rather than recomputed, so the ladder and the score can
// never disagree about how long the river is.
export function Controls({ specs, on, activeRung }){
  return specs.map((spec, i) => {
    switch (spec.type){
      case "tallyGroup":
        return (
          <div className="tally-group" key={i}>
            {spec.items.map((t, j) => <Tally spec={t} on={on} key={t.path + ":" + t.key + j} />)}
          </div>
        );
      case "ladder":
        return <Ladder spec={spec} active={activeRung} key={i} />;
      case "checkGroup":
        return <CheckGroup spec={spec} on={on} key={i} />;
      case "list":
        return <NumberList spec={spec} on={on} key={i} />;
      case "num":
        return <NumField spec={spec} on={on} key={i} />;
      default:
        return null;
    }
  });
}
