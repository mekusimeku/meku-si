# MEKU STARGATE — free brain–AI intent simulator (research v0.3)

**Live demo:** https://meku.farm/stargate

STARGATE is an early MEKU SI research project about a shared, human-controlled intent interface for future brain–computer interfaces (BCIs). It asks a practical question: if different devices produce different signals, how could an AI system interpret a proposed action **without giving that signal automatic permission to act**?

The public demo runs on **synthetic signals**. It does not connect to an implant, collect brain data, control a real device, operate AI agents, run Human Cloud missions, or send money. It is not a commercial hardware integration.

## Try the public simulator

1. Open [STARGATE](https://meku.farm/stargate). No brain chip is required.
2. Choose a simulated future device profile or start without a chip.
3. Test an intent and inspect the **MIND MIRROR** review step.
4. Correct, approve, or **STOP** the simulated action. Inspect the activity shown on the page.

The site currently demonstrates a practice cursor movement, browser speech, a read-only request for public MEKU NEURA research counts, and a task draft that can be copied. STOP cancels supported page activities and ignores late responses. These are demo UI actions, **not real brain-derived instructions**.

## Four future adapter profiles

The simulator names four *possible future* BCI adapter targets:

- **Neuralink**
- **NeuCyber Beinao-2**
- **NeuroXess**
- **Neuracle NEO**

These names describe research profiles in the demonstration. They do **not** mean that MEKU has device access, vendor permission, technical compatibility, endorsement, or partnerships with these companies.

## The research question: one intent format, different devices

A possible future flow is:

```text
Future BCI signal
  → device-specific adapter
  → proposed neural intent
  → MIND MIRROR review
  → explicit human approval or STOP
  → permitted action (only where separately supported)
```

**Neural Intent Protocol v0.3 is research**, not a published hardware standard. Design questions include intent type, confidence, device identity, time bounds, handling ambiguous signals, repeat-request prevention, and what happens when someone refuses or stops an action. No raw neural data should be required by default in the proposed interface.

**Important separation:** decoding an intent is not permission to carry it out. A proposed intent must not become unrestricted agent authority.

## What is tested and what is not

| Area | Public status |
| --- | --- |
| Public STARGATE web interface | Available |
| Synthetic intent demo and MIND MIRROR | Available |
| Demo STOP behavior | Available for supported page actions |
| Read-only public NEURA number lookup | Demo action |
| Neuralink, Beinao-2, NeuroXess or NEO hardware connection | **Not available** |
| Real neural-signal decoding | **Not available** |
| Signed live intent permits or autonomous agent execution | **Not available** |
| Live payments or Human Cloud mission execution | **Not available** |

This is a simulation-first research exercise. Passing a browser demo does not prove medical, neural, hardware, or live-use safety.

## What we're asking developers and researchers

We're interested in clear, critical feedback on:

- How should low-confidence or conflicting proposed intents be shown to the person?
- How can a device adapter prove which signal was used without exposing raw brain data?
- How should STOP work when an action has already started?
- Which actions must always require a fresh human confirmation?
- What could go wrong when two device adapters disagree?

**Try it:** [MEKU STARGATE simulator](https://meku.farm/stargate)

**See the broader network:** [MEKU SI](https://meku.farm/) · [Developer documentation](https://meku.farm/docs) · [Trust and current status](https://meku.farm/trust)

**Send technical feedback:** [GitHub issues](https://github.com/mekusimeku/meku-si/issues/new) · [contact@meku.farm](mailto:contact@meku.farm)

**Human control first.** No claims of connected implants, active research partnerships, or clinical capability.
