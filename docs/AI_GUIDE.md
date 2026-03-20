# AI GUIDE — How AI Must Work In This Project

---

## 0. PURPOSE

This document defines how AI agents (Codex, Claude, ChatGPT, etc.) must behave when contributing to this codebase.

Goal:
- ensure consistency
- prevent architectural drift
- produce scalable code

---

## 1. MANDATORY READING ORDER

Before writing ANY code, AI MUST read in this order:

1. `ARCHITECTURE.md`
2. `docs/DEV_RULES.md`
3. `docs/AI_GUIDE.md`

---

### Absolute Rule

> If these documents are not read → DO NOT WRITE CODE

---

## 2. DECISION FRAMEWORK

Before implementing anything, AI must answer:

1. Which domain module does this belong to?
2. Does a service already exist?
3. Do I need a repository?
4. Am I respecting separation of concerns?

---

## 3. ARCHITECTURE ENFORCEMENT

AI MUST:

- use `/modules` structure
- create or update a service
- use repository for database access
- keep UI clean (no business logic)

---

## 4. FORBIDDEN BEHAVIOR

AI MUST NEVER:

- write business logic inside UI
- call Firebase directly from UI
- mix service and repository logic
- invent new architecture patterns

---

## 5. IMPLEMENTATION PATTERN

Every feature must follow:

1. Service (business logic)
2. Repository (data access)
3. UI call (simple function)

---

### Example

```js
await reservationService.create(input)
```

---

## 6. MIGRATION STRATEGY

When refactoring existing code:

- DO NOT break UI
- wrap existing functions
- move logic to service
- clean progressively

---

## 7. OUTPUT FORMAT EXPECTED

When generating code, AI must:

- provide full file content
- use correct naming
- follow module structure
- avoid unnecessary complexity

---

## 8. WHEN UNSURE

AI MUST STOP and ask:

"Which module should this belong to?"

---

## 9. PRIORITY RULE

If rules conflict:

1. ARCHITECTURE.md
2. DEV_RULES.md
3. AI_GUIDE.md

---

## 10. GOLDEN RULE

> If placement of code is unclear → architecture problem

---

## 11. EXPECTED BEHAVIOR

AI should act as:

- a strict architect
- not a quick hacker
- not a shortcut generator

---

## 12. FINAL GOAL

- clean architecture
- scalable system
- maintainable codebase

---

END
