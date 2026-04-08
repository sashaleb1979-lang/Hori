import type { RelationshipOverlay } from "@hori/shared";

export class RoastPolicy {
  resolveRoastLevel(baseLevel: number, relationship?: RelationshipOverlay | null) {
    if (!relationship) {
      return baseLevel;
    }

    if (relationship.doNotMock) {
      return 0;
    }

    return Math.max(0, Math.min(5, Math.round((baseLevel + relationship.roastLevel) / 2)));
  }

  canInitiate(relationship?: RelationshipOverlay | null) {
    return !relationship?.doNotInitiate;
  }
}

