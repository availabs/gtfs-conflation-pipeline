/* eslint-disable no-param-reassign */

// We need to ensure that the function is bindable to assimilate it as a method.
// See:
//    * is the function already bound?
//        https://stackoverflow.com/q/35686850/3970755
//    * is the function an arrow function
//        https://stackoverflow.com/q/28222228/3970755
const isBindable = func => {
  if (typeof func !== "function") {
    return false;
  }

  // "bound " does prepended before name.
  // NOTE: if you must name an unbound function "bound ...", it's on you to patch this.
  if (/^bound /.test(func.name)) {
    return false;
  }

  // At this point we borrow from inspect-js/is-arrow-function
  //   SEE https://github.com/inspect-js/is-arrow-function/blob/master/index.js
  // In short, we return false iff we have an arrow function.

  // Remove all line breaks: https://stackoverflow.com/a/10805292/3970755
  const funcStringified = func.toString().replace(/\r?\n|\r/g, " ");

  // isNonArrowFnRegex
  if (/^\s*function/.test(funcStringified)) {
    return true;
  }

  // isArrowFnWithParensRegex
  if (/^\([^)]*\) *=>/.test(funcStringified)) {
    return false;
  }

  // isArrowFnWithoutParensRegex
  if (/^[^=]*=>/.test(funcStringified)) {
    return false;
  }

  // We have a non-arrow function without "bound " prefixing it name.
  // We'll assume it's boundable.
  return true;
};

/**
 * Used to assimilate and object's functions as methods on a class instance.
 * See: Javascript the Good Parts' section on Functional Inheritance.
 *
 * @param { object } priv The private state of the class instance
 * @param { object|null } pub The public state of the class instance. If null, assimilated properties & methods are private.
 * @param { object } obj Object containing the properties to assign and functions to bind.
 * @throws Will throw if a function in obj is not bindable.
 */
function assimilate(priv, pub, obj) {
  if (arguments.length === 2) {
    obj = pub;
    pub = {};
  } else if (!pub) {
    pub = {};
  }

  Object.keys(obj).forEach(k => {
    const v = obj[k];
    if (typeof v === "function") {
      if (!isBindable(v)) {
        throw new Error(
          `${k} is not bindable. Make sure it is not an arrow function or already bound.`
        );
      }
      // Internal functions access internal state
      priv[k] = v.bind(priv);
      // External functions see internal state within.
      pub[k] = priv[k];
    } else {
      priv[k] = v;
      pub[k] = v;
    }
  });
}

module.exports = assimilate;
