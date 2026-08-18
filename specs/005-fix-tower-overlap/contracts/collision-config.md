# Collision Configuration Contract

This contract defines the additions to the layout configuration structure to support overlap prevention.

## Configuration Schema

The `FORCE_LAYOUT_CONFIG_V2` object in `src/force-layout.js` is extended with the following optional or mandatory properties:

```typescript
interface ForceLayoutConfigV2 {
  // Existing properties...
  
  /**
   * Strength of the collision force.
   * Value between 0 and 1.
   * Default: 1.0
   */
  collideStrength?: number;

  /**
   * Radius multiplier for collision.
   * The actual collision radius is calculated as:
   * radius = ADJACENT_CELL_SPACING * 0.5 * collideRadiusMultiplier
   * Default: 1.0
   */
  collideRadiusMultiplier?: number;
}
```

## Frame Position Invariants

During simulation ticks, all exported simulation frames must satisfy:

$$\forall i, j \text{ where } i \neq j \text{ and kind}(i) = \text{leaf}, \text{kind}(j) = \text{leaf}:$$
$$\text{distance}(p_i, p_j) \ge \text{ADJACENT\_CELL\_SPACING} \times \text{collideRadiusMultiplier} \times \text{tolerance}$$

Where `tolerance` accounts for minor D3-force relaxation (e.g. 0.99).
