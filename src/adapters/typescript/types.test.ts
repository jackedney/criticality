import { describe, it, expect, beforeEach } from 'vitest';
import { Project } from 'ts-morph';
import { extractReferencedTypes, type ExtractedType } from './types.js';
import { extractSignature } from './signature.js';
import { createProject } from './ast.js';

describe('extractReferencedTypes', () => {
  let project: Project;

  beforeEach(() => {
    project = createProject();
  });

  /**
   * Helper to create a source file with types and a function, then extract referenced types.
   */
  function extractTypes(typeDefinitions: string, functionCode: string): ExtractedType[] {
    const sourceFile = project.createSourceFile(
      'test.ts',
      `${typeDefinitions}\n\n${functionCode}`,
      { overwrite: true }
    );

    const func = sourceFile.getFunctions()[0];
    if (!func) {
      throw new Error('No function found in source code');
    }

    const signature = extractSignature(func);
    return extractReferencedTypes(signature, project);
  }

  describe('basic type extraction', () => {
    it('extracts interface type from parameter', () => {
      const types = extractTypes(
        `interface User {
          id: number;
          name: string;
        }`,
        `function process(user: User): void {
          console.log(user);
        }`
      );

      expect(types).toHaveLength(1);
      expect(types[0]?.name).toBe('User');
      expect(types[0]?.kind).toBe('interface');
      expect(types[0]?.definition).toContain('interface User');
      expect(types[0]?.members).toHaveLength(2);
    });

    it('extracts interface type from return type', () => {
      const types = extractTypes(
        `interface Result {
          success: boolean;
          data: string;
        }`,
        `function getResult(): Result {
          return { success: true, data: "test" };
        }`
      );

      expect(types).toHaveLength(1);
      expect(types[0]?.name).toBe('Result');
      expect(types[0]?.kind).toBe('interface');
    });

    it('extracts both parameter and return types', () => {
      const types = extractTypes(
        `interface User {
          id: number;
          name: string;
        }
        interface Result {
          success: boolean;
        }`,
        `function process(user: User): Result {
          return { success: true };
        }`
      );

      expect(types).toHaveLength(2);
      const names = types.map((t) => t.name);
      expect(names).toContain('User');
      expect(names).toContain('Result');
    });

    it('extracts type alias', () => {
      const types = extractTypes(
        `type UserId = string;`,
        `function getUser(id: UserId): void {
          console.log(id);
        }`
      );

      expect(types).toHaveLength(1);
      expect(types[0]?.name).toBe('UserId');
      expect(types[0]?.kind).toBe('type');
    });

    it('extracts enum type', () => {
      const types = extractTypes(
        `enum Status {
          Active = "active",
          Inactive = "inactive",
        }`,
        `function setStatus(status: Status): void {
          console.log(status);
        }`
      );

      expect(types).toHaveLength(1);
      expect(types[0]?.name).toBe('Status');
      expect(types[0]?.kind).toBe('enum');
      expect(types[0]?.members).toHaveLength(2);
    });

    it('extracts class type', () => {
      const types = extractTypes(
        `class Person {
          name: string;
          age: number;
          constructor(name: string, age: number) {
            this.name = name;
            this.age = age;
          }
        }`,
        `function greet(person: Person): string {
          return "Hello " + person.name;
        }`
      );

      expect(types).toHaveLength(1);
      expect(types[0]?.name).toBe('Person');
      expect(types[0]?.kind).toBe('class');
    });
  });

  describe('transitive type references', () => {
    it('follows type references transitively (Foo references Bar)', () => {
      const types = extractTypes(
        `interface Address {
          street: string;
          city: string;
        }
        interface User {
          id: number;
          address: Address;
        }`,
        `function process(user: User): void {
          console.log(user);
        }`
      );

      expect(types).toHaveLength(2);
      const names = types.map((t) => t.name);
      expect(names).toContain('User');
      expect(names).toContain('Address');
    });

    it('follows deep transitive references (A -> B -> C)', () => {
      const types = extractTypes(
        `interface Country {
          name: string;
          code: string;
        }
        interface Address {
          street: string;
          country: Country;
        }
        interface User {
          id: number;
          address: Address;
        }`,
        `function process(user: User): void {
          console.log(user);
        }`
      );

      expect(types).toHaveLength(3);
      const names = types.map((t) => t.name);
      expect(names).toContain('User');
      expect(names).toContain('Address');
      expect(names).toContain('Country');
    });

    it('follows interface extension', () => {
      const types = extractTypes(
        `interface Entity {
          id: number;
          createdAt: Date;
        }
        interface User extends Entity {
          name: string;
          email: string;
        }`,
        `function process(user: User): void {
          console.log(user);
        }`
      );

      expect(types).toHaveLength(2);
      const names = types.map((t) => t.name);
      expect(names).toContain('User');
      expect(names).toContain('Entity');
    });
  });

  describe('generic types', () => {
    it('extracts generic wrapper type', () => {
      const types = extractTypes(
        `type Wrapper<T> = { value: T };`,
        `function unwrap<T>(w: Wrapper<T>): T {
          return w.value;
        }`
      );

      expect(types).toHaveLength(1);
      expect(types[0]?.name).toBe('Wrapper');
      expect(types[0]?.kind).toBe('type');
      expect(types[0]?.typeParameters).toHaveLength(1);
      expect(types[0]?.typeParameters[0]?.name).toBe('T');
    });

    it('extracts generic interface', () => {
      const types = extractTypes(
        `interface Container<T> {
          value: T;
          isEmpty: boolean;
        }`,
        `function getValue<T>(c: Container<T>): T {
          return c.value;
        }`
      );

      expect(types).toHaveLength(1);
      expect(types[0]?.name).toBe('Container');
      expect(types[0]?.typeParameters).toHaveLength(1);
    });

    it('extracts type parameter constraints', () => {
      const types = extractTypes(
        `interface Identifiable {
          id: number;
        }
        interface Repository<T extends Identifiable> {
          find(id: number): T | undefined;
        }`,
        `function getRepo<T extends Identifiable>(): Repository<T> {
          throw new Error('TODO');
        }`
      );

      expect(types).toHaveLength(2);
      const names = types.map((t) => t.name);
      expect(names).toContain('Repository');
      expect(names).toContain('Identifiable');
    });

    it('extracts type with multiple type parameters', () => {
      const types = extractTypes(
        `interface Pair<K, V> {
          key: K;
          value: V;
        }`,
        `function createPair<K, V>(key: K, value: V): Pair<K, V> {
          return { key, value };
        }`
      );

      expect(types).toHaveLength(1);
      expect(types[0]?.name).toBe('Pair');
      expect(types[0]?.typeParameters).toHaveLength(2);
      expect(types[0]?.typeParameters[0]?.name).toBe('K');
      expect(types[0]?.typeParameters[1]?.name).toBe('V');
    });
  });

  describe('union and intersection types', () => {
    it('extracts types from union type', () => {
      const types = extractTypes(
        `interface Success {
          status: "success";
          data: string;
        }
        interface Failure {
          status: "failure";
          error: string;
        }`,
        `function process(): Success | Failure {
          return { status: "success", data: "test" };
        }`
      );

      expect(types).toHaveLength(2);
      const names = types.map((t) => t.name);
      expect(names).toContain('Success');
      expect(names).toContain('Failure');
    });

    it('extracts types from intersection type', () => {
      const types = extractTypes(
        `interface Named {
          name: string;
        }
        interface Aged {
          age: number;
        }`,
        `function process(person: Named & Aged): void {
          console.log(person);
        }`
      );

      expect(types).toHaveLength(2);
      const names = types.map((t) => t.name);
      expect(names).toContain('Named');
      expect(names).toContain('Aged');
    });

    it('extracts types from complex union/intersection', () => {
      const types = extractTypes(
        `interface Base {
          id: number;
        }
        interface AdminExtra {
          role: string;
        }
        interface UserExtra {
          email: string;
        }`,
        `function process(entity: Base & (AdminExtra | UserExtra)): void {
          console.log(entity);
        }`
      );

      expect(types).toHaveLength(3);
      const names = types.map((t) => t.name);
      expect(names).toContain('Base');
      expect(names).toContain('AdminExtra');
      expect(names).toContain('UserExtra');
    });
  });

  describe('negative cases - built-in types', () => {
    it('does NOT extract primitive types (string, number, boolean)', () => {
      const types = extractTypes(
        ``,
        `function process(name: string, age: number, active: boolean): void {
          console.log(name, age, active);
        }`
      );

      expect(types).toHaveLength(0);
    });

    it('does NOT extract Promise type', () => {
      const types = extractTypes(
        ``,
        `async function fetchData(): Promise<string> {
          return "data";
        }`
      );

      expect(types).toHaveLength(0);
    });

    it('does NOT extract Array type', () => {
      const types = extractTypes(
        ``,
        `function getNumbers(): number[] {
          return [1, 2, 3];
        }`
      );

      expect(types).toHaveLength(0);
    });

    it('does NOT extract Map/Set types', () => {
      const types = extractTypes(
        ``,
        `function getData(): Map<string, number> {
          return new Map();
        }`
      );

      expect(types).toHaveLength(0);
    });

    it('does NOT extract utility types (Partial, Required, etc.)', () => {
      const types = extractTypes(
        `interface User { name: string; }`,
        `function process(user: Partial<User>): void {
          console.log(user);
        }`
      );

      // Should extract User but not Partial
      expect(types).toHaveLength(1);
      expect(types[0]?.name).toBe('User');
    });
  });

  describe('negative cases - node_modules types', () => {
    it('does NOT extract types from node_modules', () => {
      // When using built-in types like Date or Error, they should not be extracted
      const types = extractTypes(
        ``,
        `function getDate(): Date {
          return new Date();
        }`
      );

      expect(types).toHaveLength(0);
    });
  });

  describe('complex type hierarchies', () => {
    it('handles circular type references without infinite loop', () => {
      const types = extractTypes(
        `interface Node {
          value: string;
          children: Node[];
        }`,
        `function traverse(node: Node): void {
          console.log(node);
        }`
      );

      expect(types).toHaveLength(1);
      expect(types[0]?.name).toBe('Node');
    });

    it('handles mutually recursive types', () => {
      const types = extractTypes(
        `interface Foo {
          bar: Bar;
        }
        interface Bar {
          foo: Foo;
        }`,
        `function process(foo: Foo): Bar {
          return foo.bar;
        }`
      );

      expect(types).toHaveLength(2);
      const names = types.map((t) => t.name);
      expect(names).toContain('Foo');
      expect(names).toContain('Bar');
    });

    it('extracts types from object type alias', () => {
      const types = extractTypes(
        `type Config = {
          host: string;
          port: number;
          secure: boolean;
        };`,
        `function configure(config: Config): void {
          console.log(config);
        }`
      );

      expect(types).toHaveLength(1);
      expect(types[0]?.name).toBe('Config');
      expect(types[0]?.kind).toBe('type');
      expect(types[0]?.members).toHaveLength(3);
    });

    it('extracts types referenced in type alias members', () => {
      const types = extractTypes(
        `interface Address {
          street: string;
        }
        type UserConfig = {
          name: string;
          address: Address;
        };`,
        `function configure(config: UserConfig): void {
          console.log(config);
        }`
      );

      expect(types).toHaveLength(2);
      const names = types.map((t) => t.name);
      expect(names).toContain('UserConfig');
      expect(names).toContain('Address');
    });
  });

  describe('PRD examples', () => {
    it('function process(user: User): Result extracts User and Result', () => {
      const types = extractTypes(
        `interface User {
          id: number;
          name: string;
        }
        interface Result {
          success: boolean;
          message: string;
        }`,
        `function process(user: User): Result {
          return { success: true, message: "Processed " + user.name };
        }`
      );

      expect(types).toHaveLength(2);
      const names = types.map((t) => t.name);
      expect(names).toContain('User');
      expect(names).toContain('Result');
    });

    it('type Wrapper<T> with function unwrap<T>(w: Wrapper<T>): T extracts Wrapper', () => {
      const types = extractTypes(
        `type Wrapper<T> = { value: T };`,
        `function unwrap<T>(w: Wrapper<T>): T {
          return w.value;
        }`
      );

      expect(types).toHaveLength(1);
      expect(types[0]?.name).toBe('Wrapper');
    });
  });

  describe('interface members extraction', () => {
    it('extracts interface properties with types', () => {
      const types = extractTypes(
        `interface User {
          id: number;
          name: string;
          email?: string;
        }`,
        `function process(user: User): void {}`
      );

      expect(types).toHaveLength(1);
      const user = types[0];
      expect(user?.members).toHaveLength(3);

      const idMember = user?.members.find((m) => m.name === 'id');
      expect(idMember?.type).toBe('number');
      expect(idMember?.isOptional).toBe(false);

      const emailMember = user?.members.find((m) => m.name === 'email');
      expect(emailMember?.isOptional).toBe(true);
    });

    it('extracts interface methods', () => {
      const types = extractTypes(
        `interface Repository {
          find(id: number): User | undefined;
          save(user: User): void;
        }
        interface User {
          id: number;
        }`,
        `function getRepo(): Repository {
          throw new Error('TODO');
        }`
      );

      const repo = types.find((t) => t.name === 'Repository');
      expect(repo).toBeDefined();
      expect(repo?.members.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('enum members extraction', () => {
    it('extracts enum members with values', () => {
      const types = extractTypes(
        `enum Color {
          Red = "red",
          Green = "green",
          Blue = "blue",
        }`,
        `function getColor(): Color {
          return Color.Red;
        }`
      );

      expect(types).toHaveLength(1);
      const colorEnum = types[0];
      expect(colorEnum?.members).toHaveLength(3);

      const redMember = colorEnum?.members.find((m) => m.name === 'Red');
      expect(redMember?.type).toBe('red');
    });

    it('extracts numeric enum members', () => {
      const types = extractTypes(
        `enum Priority {
          Low = 1,
          Medium = 2,
          High = 3,
        }`,
        `function getPriority(): Priority {
          return Priority.High;
        }`
      );

      expect(types).toHaveLength(1);
      const priorityEnum = types[0];
      expect(priorityEnum?.members).toHaveLength(3);

      const highMember = priorityEnum?.members.find((m) => m.name === 'High');
      expect(highMember?.type).toBe('3');
    });
  });

  describe('type parameters extraction', () => {
    it('extracts type parameter with constraint', () => {
      const types = extractTypes(
        `interface Identifiable {
          id: number;
        }
        interface Container<T extends Identifiable> {
          item: T;
        }`,
        `function get<T extends Identifiable>(c: Container<T>): T {
          return c.item;
        }`
      );

      const container = types.find((t) => t.name === 'Container');
      expect(container?.typeParameters).toHaveLength(1);
      expect(container?.typeParameters[0]?.name).toBe('T');
      expect(container?.typeParameters[0]?.constraint).toBe('Identifiable');
    });

    it('extracts type parameter with default', () => {
      const types = extractTypes(
        `interface Box<T = string> {
          value: T;
        }`,
        `function unbox(b: Box): string {
          return b.value;
        }`
      );

      expect(types).toHaveLength(1);
      const box = types[0];
      expect(box?.typeParameters).toHaveLength(1);
      expect(box?.typeParameters[0]?.default).toBe('string');
    });
  });

  describe('types inside generic built-ins', () => {
    it('extracts custom type from Promise<CustomType>', () => {
      const types = extractTypes(
        `interface User {
          id: number;
          name: string;
        }`,
        `async function getUser(): Promise<User> {
          return { id: 1, name: "test" };
        }`
      );

      expect(types).toHaveLength(1);
      expect(types[0]?.name).toBe('User');
    });

    it('extracts custom type from Array<CustomType>', () => {
      const types = extractTypes(
        `interface Item {
          id: number;
        }`,
        `function getItems(): Array<Item> {
          return [];
        }`
      );

      expect(types).toHaveLength(1);
      expect(types[0]?.name).toBe('Item');
    });

    it('extracts custom types from Map<Key, Value> where Key/Value are custom', () => {
      const types = extractTypes(
        `interface UserId {
          value: string;
        }
        interface User {
          id: UserId;
          name: string;
        }`,
        `function getUserMap(): Map<UserId, User> {
          return new Map();
        }`
      );

      expect(types).toHaveLength(2);
      const names = types.map((t) => t.name);
      expect(names).toContain('UserId');
      expect(names).toContain('User');
    });
  });

  describe('edge cases', () => {
    it('handles function with no custom types', () => {
      const types = extractTypes(
        ``,
        `function add(a: number, b: number): number {
          return a + b;
        }`
      );

      expect(types).toHaveLength(0);
    });

    it('handles void return type', () => {
      const types = extractTypes(
        `interface Logger {
          log(message: string): void;
        }`,
        `function useLogger(logger: Logger): void {
          logger.log("test");
        }`
      );

      expect(types).toHaveLength(1);
      expect(types[0]?.name).toBe('Logger');
    });

    it('deduplicates types that appear multiple times', () => {
      const types = extractTypes(
        `interface User {
          id: number;
        }`,
        `function process(user1: User, user2: User): User {
          return user1;
        }`
      );

      expect(types).toHaveLength(1);
      expect(types[0]?.name).toBe('User');
    });
  });
});
