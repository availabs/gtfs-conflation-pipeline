/* eslint-disable no-param-reassign, jsdoc/require-jsdoc, no-empty-function */

const assimilate = require('./assimilate');

describe('assimilate', () => {
  test('Simple assigning', () => {
    const foo = {};
    const bar = { a: 1, b: 2 };

    assimilate(foo, bar);

    expect(foo).toEqual(bar);
  });

  test('Simple binding', () => {
    const foo = { a: 'bar' };
    const baz = {
      fn() {
        return this.a;
      }
    };

    assimilate(foo, baz);

    expect(foo.fn()).toEqual('bar');
  });

  test('public and private properties and methods', () => {
    function privMethod() {
      expect(this.privProp).toBeDefined();
      expect(this.pubProp).toBeDefined();

      expect(this.privMethod).toBeDefined();
      expect(this.pubMethod).toBeDefined();
    }

    function pubMethod() {
      expect(this.privProp).toBeDefined();
      expect(this.pubProp).toBeDefined();

      expect(this.pubMethod).toBeDefined();
      expect(() => this.privMethod).not.toThrow();
    }

    class TestClass {
      constructor() {
        const priv = {
          privProp: 'inner',
          privMethod
        };

        const pub = {
          pubProp: 'outer',
          pubMethod
        };

        const that = {};

        assimilate(that, null, priv);
        assimilate(that, this, pub);
      }
    }

    const testInstance = new TestClass();

    // Private properties and methods are hidden.
    expect(testInstance.privProp).toBeUndefined();
    expect(testInstance.privMethod).toBeUndefined();

    // Private properties and methods are defined.
    expect(testInstance.pubProp).toBeDefined();
    expect(testInstance.pubMethod).toBeDefined();

    // The expectations within public methods hold true.
    testInstance.pubMethod();
  });

  test('does not throw if function is bindable', () => {
    /**
     *
     */
    function fn1() {}
    async function fn2() {
      return null;
    }
    const x = {
      fn3() {},
      async fn4() {
        return null;
      }
    };
    const { fn3: fn5, fn4: fn6 } = x;

    expect(() =>
      assimilate({}, {}, { fn1, fn2, fn3: x.fn3, fn4: x.fn4, fn5, fn6 })
    ).not.toThrow();
  });

  test('throws if function is unbindable', () => {
    /**
     *
     */
    function fn1() {}
    async function fn2() {
      return null;
    }

    const x = {
      fn3() {},
      async fn4() {
        return null;
      },
      fn5: () => {}
    };

    const fn6 = () => {};
    const fn7 = async () => {};

    const fn8 = fn6.bind();
    const fn9 = fn7.bind();

    // prettier-ignore
    // eslint-disable-next-line
    const fn10 = ( a1, b1, c1, d1, e1, f1, g1, h1, i1, j1, k1, l1, m1, n1, o1, p1, q1, r1, s1, t1, u1, v1, w1, x1, y1, z1, a2, b2, c2, d2, e2, f2, g2, h2, i2, j2, k2, l2, m2, n2, o2, p2, q2, r2, s2, t2, u2, v2, w2, x2, y2, z2) => {};

    expect(() => assimilate({}, {}, { fn1: fn1.bind() })).toThrow();
    expect(() => assimilate({}, {}, { fn2: fn2.bind() })).toThrow();
    expect(() => assimilate({}, {}, { fn3: x.fn3.bind() })).toThrow();
    expect(() => assimilate({}, {}, { fn4: x.fn4.bind() })).toThrow();
    expect(() => assimilate({}, {}, { fn5: x.fn5 })).toThrow();
    expect(() => assimilate({}, {}, { fn6 })).toThrow();
    expect(() => assimilate({}, {}, { fn7 })).toThrow();
    expect(() => assimilate({}, {}, { fn8 })).toThrow();
    expect(() => assimilate({}, {}, { fn9 })).toThrow();
    expect(() => assimilate({}, {}, { fn10 })).toThrow();
  });
});
