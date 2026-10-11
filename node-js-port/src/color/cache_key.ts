/**
 * Not ported: the `color` crate's `cache_key.rs` defines the `BitEq` and
 * `BitHash` traits that let peniko use colour types as cache keys, plus the
 * `CacheKey` newtype built on them.
 *
 * The traits exist so that `0.0` and `-0.0` hash alike — which is the behaviour
 * a JS `Map`/`Set` on bit patterns would have to reimplement by hand. Nothing in
 * this port caches on a colour key yet, so the module is left out rather than
 * shipped unused;  when the gradient cache arrives, this is where it starts.
 */
;
