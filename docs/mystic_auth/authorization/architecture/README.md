# PBAC Architecture

---

## PBAC authorization-check request flow

```mermaid
%%{init: {"themeVariables": {"lineColor": "#334155"}} }%%
flowchart TD
    Request(["Request"])
    Auth["Authentication\n current_user_dependency.py"]
    Ctx["Authorization Context Builder\n request_context_builder.py"]
    Svc["Authorization Service\n authorization_service.py"]
    Cache{"Policy Cache\n Redis\n authorization_cache_service.py"}
    Eng["Policy Evaluation Engine\n policy_evaluator.py"]
    Cond["Condition Evaluation Service\n condition_evaluation_service.py"]
    Dec["Authorization Decision\n authorization_decision.py"]
    Log["Audit Log\n audit_log_repository.py"]
    Request --> Auth --> Ctx --> Svc --> Cache
    Cache -- "hit" --> Eng
    Cache -- "miss, fetch from Postgres,\n then cache 60s" --> Eng
    Eng --> Cond --> Dec --> Log
    classDef entry fill:#eff6ff,stroke:#3b82f6,color:#1e3a8a
    classDef cache fill:#fef9c3,stroke:#ca8a04,color:#713f12
    classDef decision fill:#ede9fe,stroke:#7c3aed,color:#4c1d95
    classDef terminal fill:#f3f4f6,stroke:#6b7280,color:#1f2937
    class Request entry
    class Cache cache
    class Dec decision
    class Log terminal
    linkStyle default stroke:#334155,stroke-width:2px
```

---

Every real (non-hypothetical) authorization decision in the app goes through this exact pipeline, once. Nothing above the Authorization Service reads a user's role, a permission-role mapping, or does its own access comparison: routes only ever declare *what action on what resource type* they need. Before evaluation, the Authorization Service fetches the caller's active policies through a Redis cache-aside layer (`authorization/repositories/policy_assignment_repository.py`), not straight from Postgres on every call. See [Troubleshooting: Redis cache management](../troubleshooting/redis-and-logging.md#redis-cache-management) for TTL and invalidation rules.

---

## Pages

- [Component Responsibilities](component-responsibilities.md): Authentication, Authorization Context Builder, Authorization Service, Policy Evaluation Engine, Condition Evaluation Service, Authorization Decision, Audit Log.
- [Integration Points and Real-Time Push](real-time-push.md): how routes and policy mutations hook into the pipeline, and how open browser tabs learn about a permission change live.
- [Full Route List](full-route-list.md): every PBAC route and the permission it requires.
- [Frontend Policy Management UI](frontend-ui.md): the admin-facing policy/permission screens.

---
