import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { createAllocator, setPrefix } from "./index.js";

describe("ShortCodeAllocator", () => {
  let db: Database.Database;

  beforeEach(() => {
    // Create in-memory database with schema
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE short_code_counters (
        type_code TEXT PRIMARY KEY NOT NULL,
        next_n INTEGER NOT NULL DEFAULT 1
      );

      INSERT INTO short_code_counters (type_code, next_n) VALUES
        ('PD', 1), ('E', 1), ('US', 1), ('TH', 1), ('TL', 1), ('TU', 1), ('A', 1);

      CREATE TABLE configuration (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at REAL NOT NULL DEFAULT (julianday('now'))
      );

      INSERT INTO configuration (key, value) VALUES ('project.prefix', 'KAT');
    `);
  });

  it("allocate('epic') returns KAT-E-0001, then KAT-E-0002", () => {
    const allocator = createAllocator(db);

    const code1 = db.transaction(() => {
      return allocator.allocate("epic");
    })();
    expect(code1).toBe("KAT-E-0001");

    const code2 = db.transaction(() => {
      return allocator.allocate("epic");
    })();
    expect(code2).toBe("KAT-E-0002");
  });

  it("allocator is type-scoped: interleaved epic/task-high-pass calls produce independent sequences", () => {
    const allocator = createAllocator(db);

    const epic1 = db.transaction(() => allocator.allocate("epic"))();
    expect(epic1).toBe("KAT-E-0001");

    const task1 = db.transaction(() => allocator.allocate("task-high-pass"))();
    expect(task1).toBe("KAT-TH-0001");

    const epic2 = db.transaction(() => allocator.allocate("epic"))();
    expect(epic2).toBe("KAT-E-0002");

    const task2 = db.transaction(() => allocator.allocate("task-high-pass"))();
    expect(task2).toBe("KAT-TH-0002");
  });

  it("setPrefix('ACME') then allocate produces ACME-PD-0001", () => {
    setPrefix(db, "ACME");
    const allocator = createAllocator(db);

    const code = db.transaction(() => allocator.allocate("product-doc"))();
    expect(code).toBe("ACME-PD-0001");
  });

  it("concurrent transactions (sequential in better-sqlite3) assert no duplicates", () => {
    const allocator = createAllocator(db);

    const codes = new Set<string>();

    for (let i = 0; i < 5; i++) {
      const code = db.transaction(() => allocator.allocate("epic"))();
      codes.add(code);
    }

    // All codes should be unique
    expect(codes.size).toBe(5);
    // Verify they are sequential
    expect(Array.from(codes).sort()).toEqual([
      "KAT-E-0001",
      "KAT-E-0002",
      "KAT-E-0003",
      "KAT-E-0004",
      "KAT-E-0005",
    ]);
  });

  it("invalid prefix 'bad' throws", () => {
    expect(() => setPrefix(db, "bad")).toThrow("Invalid prefix: bad");
  });
});
