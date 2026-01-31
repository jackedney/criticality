## 2025-02-12 - Reusing ts-morph Project & Optimized Traversal
**Learning:** Initializing a new `ts-morph` Project is expensive. For repeated syntax validation, using a singleton `Project` instance with in-memory FS reduced test runtime by ~5.5x (8.8s -> 1.6s). Also, replacing `forEachDescendant` and manual recursion with `getDescendantsOfKind` avoids unnecessary object allocations.
**Action:** Always reuse Project instances for transient operations and prefer `getDescendantsOfKind` for finding nodes.
