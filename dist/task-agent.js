#!/usr/bin/env bun
// @bun
import { createRequire } from "node:module";
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// node_modules/taskwarrior-lib/dist/index.js
var require_dist = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.TaskwarriorLib = exports.TaskError = undefined;
  var child_process_1 = __require("child_process");

  class TaskError extends Error {
  }
  exports.TaskError = TaskError;
  function isISODate(str) {
    return /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str);
  }

  class TaskwarriorLib {
    constructor(rcPath, dataPath) {
      const rcEnv = rcPath ? `TASKRC=${rcPath}` : "";
      const dataEnv = dataPath ? `TASKDATA=${dataPath}` : "";
      this.env = `${rcEnv} ${dataEnv}`;
    }
    executeCommand(args, input) {
      try {
        const result = child_process_1.execSync(`${this.env} task rc.confirmation=no rc.recurrence.confirmation=no rc.dependency.confirmation=no rc.json.depends.array=yes rc.bulk=0 ${args}`, {
          encoding: "utf8",
          maxBuffer: 200 * 1024 * 1024,
          input
        });
        return result;
      } catch (err) {
        throw new TaskError("Task command error");
      }
    }
    calc(expression) {
      return expression && this.executeCommand(`calc ${expression}`);
    }
    calcDate(expression) {
      const result = this.calc(expression);
      if (result && !isISODate(result)) {
        throw new TaskError(`Invalid date string '${expression}'`);
      }
      return result;
    }
    checkPeriod(period) {
      const result = this.calc(period);
      if (result && result.charAt(0) !== "P") {
        throw new TaskError(`Invalid period string '${period}'`);
      }
    }
    config() {
      const result = this.executeCommand("_show");
      const config = {};
      if (result) {
        for (const line of result.split(`
`)) {
          var separator = line.indexOf("=");
          const [key, value] = [
            line.substr(0, separator),
            line.substr(separator + 1)
          ];
          const path = key.split(".");
          let obj = config;
          for (let i = 0;i < path.length - 1; ++i) {
            const objKey = path[i] + ".";
            if (!obj[objKey]) {
              obj[objKey] = {};
            }
            obj = obj[objKey];
          }
          obj[path[path.length - 1]] = value;
        }
      }
      return config;
    }
    load(filters = "") {
      const rawData = this.executeCommand(`${filters} export`);
      return JSON.parse(rawData);
    }
    del(tasks) {
      const args = `${tasks.map((task) => task.uuid).join(" ")} delete`;
      const result = this.executeCommand(args);
      return result;
    }
    update(tasks) {
      const result = this.executeCommand("import", JSON.stringify(tasks.map((task) => {
        this.checkPeriod(task.recur);
        return Object.assign(Object.assign({}, task), { due: this.calcDate(task.due), until: this.calcDate(task.until), wait: this.calcDate(task.wait), scheduled: this.calcDate(task.scheduled), start: this.calcDate(task.start) });
      })));
      return result;
    }
  }
  exports.TaskwarriorLib = TaskwarriorLib;
});

// index.ts
import { execFileSync } from "child_process";
import { randomUUID } from "crypto";

// .reference/stricli/packages/core/src/context.ts
function checkEnvironmentVariable(process2, varName) {
  const value = process2.env?.[varName];
  return typeof value === "string" && value !== "0";
}

// .reference/stricli/packages/core/src/exit-code.ts
var ExitCode = {
  UnknownCommand: -5,
  InvalidArgument: -4,
  ContextLoadError: -3,
  CommandLoadError: -2,
  InternalError: -1,
  Success: 0,
  CommandRunError: 1
};

// .reference/stricli/packages/core/src/util/case-style.ts
function convertKebabCaseToCamelCase(str) {
  return str.replace(/-./g, (match) => match[1].toUpperCase());
}
function convertCamelCaseToKebabCase(name) {
  return Array.from(name).map((char, i) => {
    const upper = char.toUpperCase();
    const lower = char.toLowerCase();
    if (i === 0 || upper !== char || upper === lower) {
      return char;
    }
    return `-${lower}`;
  }).join("");
}

// .reference/stricli/packages/core/src/util/distance.ts
function newSparseMatrix(defaultValue) {
  const values = new Map;
  return {
    get: (...args) => {
      return values.get(args.join(",")) ?? defaultValue;
    },
    set: (value, ...args) => {
      values.set(args.join(","), value);
    }
  };
}
function damerauLevenshtein(a, b, options) {
  const { threshold, weights } = options;
  if (a === b) {
    return 0;
  }
  const lengthDiff = Math.abs(a.length - b.length);
  if (typeof threshold === "number" && lengthDiff > threshold) {
    return Infinity;
  }
  const matrix = newSparseMatrix(Infinity);
  matrix.set(0, -1, -1);
  for (let j = 0;j < b.length; ++j) {
    matrix.set((j + 1) * weights.insertion, -1, j);
  }
  for (let i = 0;i < a.length; ++i) {
    matrix.set((i + 1) * weights.deletion, i, -1);
  }
  let prevRowMinDistance = -Infinity;
  for (let i = 0;i < a.length; ++i) {
    let rowMinDistance = Infinity;
    for (let j = 0;j <= b.length - 1; ++j) {
      const cost = a[i] === b[j] ? 0 : 1;
      const distances = [
        matrix.get(i - 1, j) + weights.deletion,
        matrix.get(i, j - 1) + weights.insertion,
        matrix.get(i - 1, j - 1) + cost * weights.substitution
      ];
      if (a[i] === b[j - 1] && a[i - 1] === b[j]) {
        distances.push(matrix.get(i - 2, j - 2) + cost * weights.transposition);
      }
      const minDistance = Math.min(...distances);
      matrix.set(minDistance, i, j);
      if (minDistance < rowMinDistance) {
        rowMinDistance = minDistance;
      }
    }
    if (rowMinDistance > threshold) {
      if (prevRowMinDistance > threshold) {
        return Infinity;
      }
      prevRowMinDistance = rowMinDistance;
    } else {
      prevRowMinDistance = -Infinity;
    }
  }
  const distance = matrix.get(a.length - 1, b.length - 1);
  if (distance > threshold) {
    return Infinity;
  }
  return distance;
}
function compareAlternatives(a, b, target) {
  const cmp = a[1] - b[1];
  if (cmp !== 0) {
    return cmp;
  }
  const aStartsWith = a[0].startsWith(target);
  const bStartsWith = b[0].startsWith(target);
  if (aStartsWith && !bStartsWith) {
    return -1;
  } else if (!aStartsWith && bStartsWith) {
    return 1;
  }
  return a[0].localeCompare(b[0]);
}
function filterClosestAlternatives(target, alternatives, options) {
  const validAlternatives = alternatives.map((alt) => [alt, damerauLevenshtein(target, alt, options)]).filter(([, dist]) => dist <= options.threshold);
  const minDistance = Math.min(...validAlternatives.map(([, dist]) => dist));
  return validAlternatives.filter(([, dist]) => dist === minDistance).sort((a, b) => compareAlternatives(a, b, target)).map(([alt]) => alt);
}

// .reference/stricli/packages/core/src/util/error.ts
class InternalError extends Error {
}
function formatException(exc) {
  if (exc instanceof Error) {
    return exc.stack ?? String(exc);
  }
  return String(exc);
}

// .reference/stricli/packages/core/src/util/formatting.ts
function maximum(arr1, arr2) {
  const maxValues = [];
  const maxLength = Math.max(arr1.length, arr2.length);
  for (let i = 0;i < maxLength; ++i) {
    maxValues[i] = Math.max(arr1[i], arr2[i]);
  }
  return maxValues;
}
function formatRowsWithColumns(cells, separators) {
  if (cells.length === 0) {
    return [];
  }
  const startingLengths = Array(Math.max(...cells.map((cellRow) => cellRow.length))).fill(0, 0);
  const maxLengths = cells.reduce((acc, cellRow) => {
    const lengths = cellRow.map((cell) => cell.length);
    return maximum(acc, lengths);
  }, startingLengths);
  return cells.map((cellRow) => {
    const firstCell = (cellRow[0] ?? "").padEnd(maxLengths[0]);
    return cellRow.slice(1).reduce((parts, str, i, arr) => {
      const paddedStr = arr.length === i + 1 ? str : str.padEnd(maxLengths[i + 1]);
      return [...parts, separators?.[i] ?? " ", paddedStr];
    }, [firstCell]).join("").trimEnd();
  });
}
function joinWithGrammar(parts, grammar) {
  if (parts.length <= 1) {
    return parts[0] ?? "";
  }
  if (parts.length === 2) {
    return parts.join(` ${grammar.conjunction} `);
  }
  let allButLast = parts.slice(0, parts.length - 1).join(", ");
  if (grammar.serialComma) {
    allButLast += ",";
  }
  return [allButLast, grammar.conjunction, parts[parts.length - 1]].join(" ");
}

// .reference/stricli/packages/core/src/util/array.ts
function group(array, callback) {
  return array.reduce((groupings, item) => {
    const key = callback(item);
    const groupItems = groupings[key] ?? [];
    groupItems.push(item);
    groupings[key] = groupItems;
    return groupings;
  }, {});
}
function groupBy(array, selector) {
  return group(array, (item) => item[selector]);
}

// .reference/stricli/packages/core/src/util/promise.ts
async function allSettledOrElse(values) {
  const results = await Promise.allSettled(values);
  const grouped = groupBy(results, "status");
  if (grouped.rejected && grouped.rejected.length > 0) {
    return { status: "rejected", reasons: grouped.rejected.map((result) => result.reason) };
  }
  return { status: "fulfilled", value: grouped.fulfilled?.map((result) => result.value) ?? [] };
}

// .reference/stricli/packages/core/src/parameter/parser/boolean.ts
var TRUTHY_VALUES = new Set(["true", "t", "yes", "y", "on", "1"]);
var FALSY_VALUES = new Set(["false", "f", "no", "n", "off", "0"]);
var looseBooleanParser = (input) => {
  const value = input.toLowerCase();
  if (TRUTHY_VALUES.has(value)) {
    return true;
  }
  if (FALSY_VALUES.has(value)) {
    return false;
  }
  throw new SyntaxError(`Cannot convert ${input} to a boolean`);
};

// .reference/stricli/packages/core/src/parameter/parser/number.ts
var numberParser = (input) => {
  const value = Number(input);
  if (Number.isNaN(value)) {
    throw new SyntaxError(`Cannot convert ${input} to a number`);
  }
  return value;
};

// .reference/stricli/packages/core/src/parameter/scanner.ts
class ArgumentScannerError extends InternalError {
  _brand;
}
function formatMessageForArgumentScannerError(error, formatter) {
  const errorType = error.constructor.name;
  const formatError = formatter[errorType];
  if (formatError) {
    return formatError(error);
  }
  return error.message;
}
function resolveAliases(flags, aliases, scannerCaseStyle) {
  return Object.fromEntries(Object.entries(aliases).map(([alias, internalFlagName_]) => {
    const internalFlagName = internalFlagName_;
    const flag = flags[internalFlagName];
    if (!flag) {
      const externalFlagName = asExternal(internalFlagName, scannerCaseStyle);
      throw new FlagNotFoundError(externalFlagName, [], alias);
    }
    return [alias, [internalFlagName, flag]];
  }));
}

class FlagNotFoundError extends ArgumentScannerError {
  input;
  corrections;
  aliasName;
  constructor(input, corrections, aliasName) {
    let message = `No flag registered for --${input}`;
    if (aliasName) {
      message += ` (aliased from -${aliasName})`;
    } else if (corrections.length > 0) {
      const formattedCorrections = joinWithGrammar(corrections.map((correction) => `--${correction}`), {
        kind: "conjunctive",
        conjunction: "or",
        serialComma: true
      });
      message += `, did you mean ${formattedCorrections}?`;
    }
    super(message);
    this.input = input;
    this.corrections = corrections;
    this.aliasName = aliasName;
  }
}

class AliasNotFoundError extends ArgumentScannerError {
  input;
  constructor(input) {
    super(`No alias registered for -${input}`);
    this.input = input;
  }
}
function getPlaceholder(param, index) {
  if (param.placeholder) {
    return param.placeholder;
  }
  return typeof index === "number" ? `arg${index}` : "args";
}
function asExternal(internal, scannerCaseStyle) {
  return scannerCaseStyle === "allow-kebab-for-camel" ? convertCamelCaseToKebabCase(internal) : internal;
}

class ArgumentParseError extends ArgumentScannerError {
  externalFlagNameOrPlaceholder;
  input;
  exception;
  constructor(externalFlagNameOrPlaceholder, input, exception) {
    super(`Failed to parse "${input}" for ${externalFlagNameOrPlaceholder}: ${exception instanceof Error ? exception.message : String(exception)}`);
    this.externalFlagNameOrPlaceholder = externalFlagNameOrPlaceholder;
    this.input = input;
    this.exception = exception;
  }
}
function parseInput(externalFlagNameOrPlaceholder, parameter, input, context) {
  try {
    return parameter.parse.call(context, input);
  } catch (exc) {
    throw new ArgumentParseError(externalFlagNameOrPlaceholder, input, exc);
  }
}

class EnumValidationError extends ArgumentScannerError {
  externalFlagName;
  input;
  values;
  constructor(externalFlagName, input, values, corrections) {
    let message = `Expected "${input}" to be one of (${values.join("|")})`;
    if (corrections.length > 0) {
      const formattedCorrections = joinWithGrammar(corrections.map((str) => `"${str}"`), {
        kind: "conjunctive",
        conjunction: "or",
        serialComma: true
      });
      message += `, did you mean ${formattedCorrections}?`;
    }
    super(message);
    this.externalFlagName = externalFlagName;
    this.input = input;
    this.values = values;
  }
}

class UnsatisfiedFlagError extends ArgumentScannerError {
  externalFlagName;
  nextFlagName;
  constructor(externalFlagName, nextFlagName) {
    let message = `Expected input for flag --${externalFlagName}`;
    if (nextFlagName) {
      message += ` but encountered --${nextFlagName} instead`;
    }
    super(message);
    this.externalFlagName = externalFlagName;
    this.nextFlagName = nextFlagName;
  }
}

class UnexpectedPositionalError extends ArgumentScannerError {
  expectedCount;
  input;
  constructor(expectedCount, input) {
    super(`Too many arguments, expected ${expectedCount} but encountered "${input}"`);
    this.expectedCount = expectedCount;
    this.input = input;
  }
}

class UnsatisfiedPositionalError extends ArgumentScannerError {
  placeholder;
  limit;
  constructor(placeholder, limit) {
    let message;
    if (limit) {
      message = `Expected at least ${limit[0]} argument(s) for ${placeholder}`;
      if (limit[1] === 0) {
        message += " but found none";
      } else {
        message += ` but only found ${limit[1]}`;
      }
    } else {
      message = `Expected argument for ${placeholder}`;
    }
    super(message);
    this.placeholder = placeholder;
    this.limit = limit;
  }
}
function undoNegation(flagName) {
  if (flagName.startsWith("no") && flagName.length > 2) {
    if (flagName[2] === "-") {
      return flagName.slice(4);
    }
    const firstChar = flagName[2];
    const firstUpper = firstChar.toUpperCase();
    if (firstChar !== firstUpper) {
      return;
    }
    const firstLower = firstChar.toLowerCase();
    return firstLower + flagName.slice(3);
  }
}
function findInternalFlagMatch(externalFlagName, flags, config) {
  const internalFlagName = externalFlagName;
  let flag = flags[internalFlagName];
  let foundFlagWithNegatedFalse;
  let foundFlagWithNegatedFalseFromKebabConversion = false;
  if (!flag) {
    const internalWithoutNegation = undoNegation(internalFlagName);
    if (internalWithoutNegation) {
      flag = flags[internalWithoutNegation];
      if (flag && flag.kind == "boolean") {
        if (flag.withNegated !== false) {
          return { namedFlag: [internalWithoutNegation, flag], negated: true };
        } else {
          foundFlagWithNegatedFalse = internalWithoutNegation;
          flag = undefined;
        }
      }
    }
  }
  const camelCaseFlagName = convertKebabCaseToCamelCase(externalFlagName);
  if (config.caseStyle === "allow-kebab-for-camel" && !flag) {
    flag = flags[camelCaseFlagName];
    if (flag) {
      return { namedFlag: [camelCaseFlagName, flag] };
    }
    const camelCaseWithoutNegation = undoNegation(camelCaseFlagName);
    if (camelCaseWithoutNegation) {
      flag = flags[camelCaseWithoutNegation];
      if (flag && flag.kind == "boolean") {
        if (flag.withNegated !== false) {
          return { namedFlag: [camelCaseWithoutNegation, flag], negated: true };
        } else {
          foundFlagWithNegatedFalse = camelCaseWithoutNegation;
          foundFlagWithNegatedFalseFromKebabConversion = true;
          flag = undefined;
        }
      }
    }
  }
  if (!flag) {
    if (foundFlagWithNegatedFalse) {
      let correction = foundFlagWithNegatedFalse;
      if (foundFlagWithNegatedFalseFromKebabConversion && externalFlagName.includes("-")) {
        correction = convertCamelCaseToKebabCase(foundFlagWithNegatedFalse);
      }
      throw new FlagNotFoundError(externalFlagName, [correction]);
    }
    if (camelCaseFlagName in flags) {
      throw new FlagNotFoundError(externalFlagName, [camelCaseFlagName]);
    }
    const kebabCaseFlagName = convertCamelCaseToKebabCase(externalFlagName);
    if (kebabCaseFlagName in flags) {
      throw new FlagNotFoundError(externalFlagName, [kebabCaseFlagName]);
    }
    const corrections = filterClosestAlternatives(internalFlagName, Object.keys(flags), config.distanceOptions);
    throw new FlagNotFoundError(externalFlagName, corrections);
  }
  return { namedFlag: [internalFlagName, flag] };
}
function isNiladic(namedFlagWithNegation) {
  if (namedFlagWithNegation.namedFlag[1].kind === "boolean" || namedFlagWithNegation.namedFlag[1].kind === "counter") {
    return true;
  }
  return false;
}
var FLAG_SHORTHAND_PATTERN = /^-([a-z]+)$/i;
var FLAG_NAME_PATTERN = /^--([a-z][a-z-.\d_]+)$/i;
function findFlagsByArgument(arg, flags, resolvedAliases, config) {
  const shorthandMatch = FLAG_SHORTHAND_PATTERN.exec(arg);
  if (shorthandMatch) {
    const batch = shorthandMatch[1];
    return Array.from(batch).map((alias) => {
      const aliasName = alias;
      const namedFlag = resolvedAliases[aliasName];
      if (!namedFlag) {
        throw new AliasNotFoundError(aliasName);
      }
      return { namedFlag };
    });
  }
  const flagNameMatch = FLAG_NAME_PATTERN.exec(arg);
  if (flagNameMatch) {
    const externalFlagName = flagNameMatch[1];
    return [findInternalFlagMatch(externalFlagName, flags, config)];
  }
  return [];
}
var FLAG_NAME_VALUE_PATTERN = /^--([a-z][a-z-.\d_]+)=(.+)$/i;
var ALIAS_VALUE_PATTERN = /^-([a-z])=(.+)$/i;

class InvalidNegatedFlagSyntaxError extends ArgumentScannerError {
  externalFlagName;
  valueText;
  constructor(externalFlagName, valueText) {
    super(`Cannot negate flag --${externalFlagName} and pass "${valueText}" as value`);
    this.externalFlagName = externalFlagName;
    this.valueText = valueText;
  }
}
function findFlagByArgumentWithInput(arg, flags, resolvedAliases, config) {
  const flagsNameMatch = FLAG_NAME_VALUE_PATTERN.exec(arg);
  if (flagsNameMatch) {
    const externalFlagName = flagsNameMatch[1];
    const { namedFlag: flagMatch, negated } = findInternalFlagMatch(externalFlagName, flags, config);
    const valueText = flagsNameMatch[2];
    if (negated) {
      throw new InvalidNegatedFlagSyntaxError(externalFlagName, valueText);
    }
    return [flagMatch, valueText];
  }
  const aliasValueMatch = ALIAS_VALUE_PATTERN.exec(arg);
  if (aliasValueMatch) {
    const aliasName = aliasValueMatch[1];
    const namedFlag = resolvedAliases[aliasName];
    if (!namedFlag) {
      throw new AliasNotFoundError(aliasName);
    }
    const valueText = aliasValueMatch[2];
    return [namedFlag, valueText];
  }
}
async function parseInputsForFlag(externalFlagName, flag, inputs, config, context) {
  if (!inputs) {
    if ("default" in flag && typeof flag.default !== "undefined") {
      if (flag.kind === "boolean") {
        return flag.default;
      }
      if (flag.kind === "enum") {
        if ("variadic" in flag && flag.variadic && Array.isArray(flag.default)) {
          const defaultArray = flag.default;
          for (const value of defaultArray) {
            if (!flag.values.includes(value)) {
              const corrections = filterClosestAlternatives(value, flag.values, config.distanceOptions);
              throw new EnumValidationError(externalFlagName, value, flag.values, corrections);
            }
          }
          return flag.default;
        }
        return flag.default;
      }
      if ("variadic" in flag && flag.variadic && Array.isArray(flag.default)) {
        const defaultArray = flag.default;
        return Promise.all(defaultArray.map((input2) => parseInput(externalFlagName, flag, input2, context)));
      }
      return parseInput(externalFlagName, flag, flag.default, context);
    }
    if (flag.optional) {
      return;
    }
    if (flag.kind === "boolean") {
      return false;
    } else if (flag.kind === "counter") {
      return 0;
    }
    throw new UnsatisfiedFlagError(externalFlagName);
  }
  if (flag.kind === "counter") {
    return inputs.reduce((total, input2) => {
      try {
        return total + numberParser.call(context, input2);
      } catch (exc) {
        throw new ArgumentParseError(externalFlagName, input2, exc);
      }
    }, 0);
  }
  if ("variadic" in flag && flag.variadic) {
    if (flag.kind === "enum") {
      for (const input2 of inputs) {
        if (!flag.values.includes(input2)) {
          const corrections = filterClosestAlternatives(input2, flag.values, config.distanceOptions);
          throw new EnumValidationError(externalFlagName, input2, flag.values, corrections);
        }
      }
      return inputs;
    }
    return Promise.all(inputs.map((input2) => parseInput(externalFlagName, flag, input2, context)));
  }
  const input = inputs[0];
  if (flag.kind === "boolean") {
    try {
      return looseBooleanParser.call(context, input);
    } catch (exc) {
      throw new ArgumentParseError(externalFlagName, input, exc);
    }
  }
  if (flag.kind === "enum") {
    if (!flag.values.includes(input)) {
      const corrections = filterClosestAlternatives(input, flag.values, config.distanceOptions);
      throw new EnumValidationError(externalFlagName, input, flag.values, corrections);
    }
    return input;
  }
  return parseInput(externalFlagName, flag, input, context);
}

class UnexpectedFlagError extends ArgumentScannerError {
  externalFlagName;
  previousInput;
  input;
  constructor(externalFlagName, previousInput, input) {
    super(`Too many arguments for --${externalFlagName}, encountered "${input}" after "${previousInput}"`);
    this.externalFlagName = externalFlagName;
    this.previousInput = previousInput;
    this.input = input;
  }
}
function isVariadicFlag(flag) {
  if (flag.kind === "counter") {
    return true;
  }
  if ("variadic" in flag) {
    return Boolean(flag.variadic);
  }
  return false;
}
function storeInput(flagInputs, scannerCaseStyle, [internalFlagName, flag], input) {
  const inputs = flagInputs.get(internalFlagName) ?? [];
  if (inputs.length > 0 && !isVariadicFlag(flag)) {
    const externalFlagName = asExternal(internalFlagName, scannerCaseStyle);
    throw new UnexpectedFlagError(externalFlagName, inputs[0], input);
  }
  if ("variadic" in flag && typeof flag.variadic === "string") {
    const multipleInputs = input.split(flag.variadic);
    flagInputs.set(internalFlagName, [...inputs, ...multipleInputs]);
  } else {
    flagInputs.set(internalFlagName, [...inputs, input]);
  }
}
function isFlagSatisfiedByInputs(flags, flagInputs, key) {
  const inputs = flagInputs.get(key);
  if (inputs) {
    const flag = flags[key];
    if (isVariadicFlag(flag)) {
      return false;
    }
    return true;
  }
  return false;
}
function buildArgumentScanner(parameters, config) {
  const { flags = {}, aliases = {}, positional = { kind: "tuple", parameters: [] } } = parameters;
  const resolvedAliases = resolveAliases(flags, aliases, config.caseStyle);
  const positionalInputs = [];
  const flagInputs = new Map;
  let positionalIndex = 0;
  let activeFlag;
  let treatInputsAsArguments = false;
  return {
    next: (input) => {
      if (!treatInputsAsArguments && config.allowArgumentEscapeSequence && input === "--") {
        if (activeFlag) {
          if (activeFlag[1].kind === "parsed" && activeFlag[1].inferEmpty) {
            storeInput(flagInputs, config.caseStyle, activeFlag, "");
            activeFlag = undefined;
          } else {
            const externalFlagName = asExternal(activeFlag[0], config.caseStyle);
            throw new UnsatisfiedFlagError(externalFlagName);
          }
        }
        treatInputsAsArguments = true;
        return;
      }
      if (!treatInputsAsArguments) {
        const flagInput = findFlagByArgumentWithInput(input, flags, resolvedAliases, config);
        if (flagInput) {
          if (activeFlag) {
            if (activeFlag[1].kind === "parsed" && activeFlag[1].inferEmpty) {
              storeInput(flagInputs, config.caseStyle, activeFlag, "");
              activeFlag = undefined;
            } else {
              const externalFlagName = asExternal(activeFlag[0], config.caseStyle);
              const nextExternalFlagName = asExternal(flagInput[0][0], config.caseStyle);
              throw new UnsatisfiedFlagError(externalFlagName, nextExternalFlagName);
            }
          }
          storeInput(flagInputs, config.caseStyle, ...flagInput);
          return;
        }
        const nextFlags = findFlagsByArgument(input, flags, resolvedAliases, config);
        if (nextFlags.length > 0) {
          if (activeFlag) {
            if (activeFlag[1].kind === "parsed" && activeFlag[1].inferEmpty) {
              storeInput(flagInputs, config.caseStyle, activeFlag, "");
              activeFlag = undefined;
            } else {
              const externalFlagName = asExternal(activeFlag[0], config.caseStyle);
              const nextFlagName = asExternal(nextFlags[0].namedFlag[0], config.caseStyle);
              throw new UnsatisfiedFlagError(externalFlagName, nextFlagName);
            }
          }
          if (nextFlags.every(isNiladic)) {
            for (const nextFlag of nextFlags) {
              if (nextFlag.namedFlag[1].kind === "boolean") {
                storeInput(flagInputs, config.caseStyle, nextFlag.namedFlag, nextFlag.negated ? "false" : "true");
              } else {
                storeInput(flagInputs, config.caseStyle, nextFlag.namedFlag, "1");
              }
            }
          } else if (nextFlags.length > 1) {
            const nextFlagExpectingArg = nextFlags.find((nextFlag) => !isNiladic(nextFlag));
            const externalFlagName = asExternal(nextFlagExpectingArg.namedFlag[0], config.caseStyle);
            throw new UnsatisfiedFlagError(externalFlagName);
          } else {
            activeFlag = nextFlags[0].namedFlag;
          }
          return;
        }
      }
      if (activeFlag) {
        storeInput(flagInputs, config.caseStyle, activeFlag, input);
        activeFlag = undefined;
      } else {
        if (positional.kind === "tuple") {
          if (positionalIndex >= positional.parameters.length) {
            throw new UnexpectedPositionalError(positional.parameters.length, input);
          }
        } else {
          if (typeof positional.maximum === "number" && positionalIndex >= positional.maximum) {
            throw new UnexpectedPositionalError(positional.maximum, input);
          }
        }
        positionalInputs[positionalIndex] = input;
        ++positionalIndex;
      }
    },
    parseArguments: async (context) => {
      const errors = [];
      let positionalValues_p;
      if (positional.kind === "array") {
        if (typeof positional.minimum === "number" && positionalIndex < positional.minimum) {
          errors.push(new UnsatisfiedPositionalError(getPlaceholder(positional.parameter), [
            positional.minimum,
            positionalIndex
          ]));
        }
        positionalValues_p = allSettledOrElse(positionalInputs.map(async (input, i) => {
          const placeholder = getPlaceholder(positional.parameter, i + 1);
          return parseInput(placeholder, positional.parameter, input, context);
        }));
      } else {
        positionalValues_p = allSettledOrElse(positional.parameters.map(async (param, i) => {
          const placeholder = getPlaceholder(param, i + 1);
          const input = positionalInputs[i];
          if (typeof input !== "string") {
            if (typeof param.default === "string") {
              return parseInput(placeholder, param, param.default, context);
            }
            if (param.optional) {
              return;
            }
            throw new UnsatisfiedPositionalError(placeholder);
          }
          return parseInput(placeholder, param, input, context);
        }));
      }
      if (activeFlag && activeFlag[1].kind === "parsed" && activeFlag[1].inferEmpty) {
        storeInput(flagInputs, config.caseStyle, activeFlag, "");
        activeFlag = undefined;
      }
      const flagEntries_p = allSettledOrElse(Object.entries(flags).map(async (entry) => {
        const [internalFlagName, flag] = entry;
        const externalFlagName = asExternal(internalFlagName, config.caseStyle);
        if (activeFlag && activeFlag[0] === internalFlagName) {
          throw new UnsatisfiedFlagError(externalFlagName);
        }
        const inputs = flagInputs.get(internalFlagName);
        const value = await parseInputsForFlag(externalFlagName, flag, inputs, config, context);
        return [internalFlagName, value];
      }));
      const [positionalValuesResult, flagEntriesResult] = await Promise.all([positionalValues_p, flagEntries_p]);
      if (positionalValuesResult.status === "rejected") {
        for (const reason of positionalValuesResult.reasons) {
          errors.push(reason);
        }
      }
      if (flagEntriesResult.status === "rejected") {
        for (const reason of flagEntriesResult.reasons) {
          errors.push(reason);
        }
      }
      if (errors.length > 0) {
        return { success: false, errors };
      }
      if (positionalValuesResult.status === "rejected") {
        throw new InternalError("Unknown failure while scanning positional arguments");
      }
      if (flagEntriesResult.status === "rejected") {
        throw new InternalError("Unknown failure while scanning flag arguments");
      }
      const parsedFlags = Object.fromEntries(flagEntriesResult.value);
      return { success: true, arguments: [parsedFlags, ...positionalValuesResult.value] };
    },
    proposeCompletions: async ({ partial, completionConfig, text, context, includeVersionFlag }) => {
      if (activeFlag) {
        return proposeFlagCompletionsForPartialInput(activeFlag[1], context, partial);
      }
      const completions = [];
      if (!treatInputsAsArguments) {
        const shorthandMatch = FLAG_SHORTHAND_PATTERN.exec(partial);
        if (completionConfig.includeAliases) {
          if (partial === "" || partial === "-") {
            const incompleteAliases = Object.entries(aliases).filter((entry) => !isFlagSatisfiedByInputs(flags, flagInputs, entry[1]));
            for (const [alias] of incompleteAliases) {
              const flag = resolvedAliases[alias];
              if (flag) {
                completions.push({
                  kind: "argument:flag",
                  completion: `-${alias}`,
                  brief: flag[1].brief
                });
              }
            }
          } else if (shorthandMatch) {
            const partialAliases = Array.from(shorthandMatch[1]);
            if (partialAliases.includes("h")) {
              return [];
            }
            if (includeVersionFlag && partialAliases.includes("v")) {
              return [];
            }
            const flagInputsIncludingPartial = new Map(flagInputs);
            for (const alias of partialAliases) {
              const namedFlag = resolvedAliases[alias];
              if (!namedFlag) {
                throw new AliasNotFoundError(alias);
              }
              storeInput(flagInputsIncludingPartial, config.caseStyle, namedFlag, namedFlag[1].kind === "boolean" ? "true" : "1");
            }
            const lastAlias = partialAliases[partialAliases.length - 1];
            if (lastAlias) {
              const namedFlag = resolvedAliases[lastAlias];
              if (namedFlag) {
                completions.push({
                  kind: "argument:flag",
                  completion: partial,
                  brief: namedFlag[1].brief
                });
              }
            }
            const incompleteAliases = Object.entries(aliases).filter((entry) => !isFlagSatisfiedByInputs(flags, flagInputsIncludingPartial, entry[1]));
            for (const [alias] of incompleteAliases) {
              const flag = resolvedAliases[alias];
              if (flag) {
                completions.push({
                  kind: "argument:flag",
                  completion: `${partial}${alias}`,
                  brief: flag[1].brief
                });
              }
            }
          }
        }
        if (partial === "" || partial === "-" || partial.startsWith("--")) {
          if (config.allowArgumentEscapeSequence) {
            completions.push({
              kind: "argument:flag",
              completion: "--",
              brief: text.briefs.argumentEscapeSequence
            });
          }
          let incompleteFlags = Object.entries(flags).filter(([flagName]) => !isFlagSatisfiedByInputs(flags, flagInputs, flagName));
          if (config.caseStyle === "allow-kebab-for-camel") {
            incompleteFlags = incompleteFlags.map(([flagName, param]) => {
              return [convertCamelCaseToKebabCase(flagName), param];
            });
          }
          const possibleFlags = incompleteFlags.map(([flagName, param]) => [`--${flagName}`, param]).filter(([flagName]) => flagName.startsWith(partial));
          completions.push(...possibleFlags.map(([name, param]) => {
            return {
              kind: "argument:flag",
              completion: name,
              brief: param.brief
            };
          }));
        }
      }
      if (positional.kind === "array") {
        if (positional.parameter.proposeCompletions) {
          if (typeof positional.maximum !== "number" || positionalIndex < positional.maximum) {
            const positionalCompletions = await positional.parameter.proposeCompletions.call(context, partial);
            completions.push(...positionalCompletions.map((value) => {
              return {
                kind: "argument:value",
                completion: value,
                brief: positional.parameter.brief
              };
            }));
          }
        }
      } else {
        const nextPositional = positional.parameters[positionalIndex];
        if (nextPositional?.proposeCompletions) {
          const positionalCompletions = await nextPositional.proposeCompletions.call(context, partial);
          completions.push(...positionalCompletions.map((value) => {
            return {
              kind: "argument:value",
              completion: value,
              brief: nextPositional.brief
            };
          }));
        }
      }
      return completions.filter(({ completion }) => completion.startsWith(partial));
    }
  };
}
async function proposeFlagCompletionsForPartialInput(flag, context, partial) {
  if (typeof flag.variadic === "string") {
    if (partial.endsWith(flag.variadic)) {
      return proposeFlagCompletionsForPartialInput(flag, context, "");
    }
  }
  let values;
  if (flag.kind === "enum") {
    values = flag.values;
  } else if (flag.proposeCompletions) {
    values = await flag.proposeCompletions.call(context, partial);
  } else {
    values = [];
  }
  return values.map((value) => {
    return {
      kind: "argument:value",
      completion: value,
      brief: flag.brief
    };
  }).filter(({ completion }) => completion.startsWith(partial));
}
function listAllRouteNamesAndAliasesForScan(routeMap, scannerCaseStyle, config) {
  const displayCaseStyle = scannerCaseStyle === "allow-kebab-for-camel" ? "convert-camel-to-kebab" : scannerCaseStyle;
  let entries = routeMap.getAllEntries();
  if (!config.includeHiddenRoutes) {
    entries = entries.filter((entry) => !entry.hidden);
  }
  return entries.flatMap((entry) => {
    const routeName = entry.name[displayCaseStyle];
    if (config.includeAliases) {
      return [routeName, ...entry.aliases];
    }
    return [routeName];
  });
}

// .reference/stricli/packages/core/src/text.ts
var text_en = {
  headers: {
    usage: "USAGE",
    aliases: "ALIASES",
    commands: "COMMANDS",
    flags: "FLAGS",
    arguments: "ARGUMENTS"
  },
  keywords: {
    default: "default =",
    separator: "separator ="
  },
  briefs: {
    help: "Print help information and exit",
    helpAll: "Print help information (including hidden commands/flags) and exit",
    version: "Print version information and exit",
    argumentEscapeSequence: "All subsequent inputs should be interpreted as arguments"
  },
  noCommandRegisteredForInput: ({ input, corrections }) => {
    const errorMessage = `No command registered for \`${input}\``;
    if (corrections.length > 0) {
      const formattedCorrections = joinWithGrammar(corrections, {
        kind: "conjunctive",
        conjunction: "or",
        serialComma: true
      });
      return `${errorMessage}, did you mean ${formattedCorrections}?`;
    } else {
      return errorMessage;
    }
  },
  noTextAvailableForLocale: ({ requestedLocale, defaultLocale }) => {
    return `Application does not support "${requestedLocale}" locale, defaulting to "${defaultLocale}"`;
  },
  exceptionWhileParsingArguments: (exc) => {
    if (exc instanceof ArgumentScannerError) {
      return formatMessageForArgumentScannerError(exc, {});
    }
    return `Unable to parse arguments, ${formatException(exc)}`;
  },
  exceptionWhileLoadingCommandFunction: (exc) => {
    return `Unable to load command function, ${formatException(exc)}`;
  },
  exceptionWhileLoadingCommandContext: (exc) => {
    return `Unable to load command context, ${formatException(exc)}`;
  },
  exceptionWhileRunningCommand: (exc) => {
    return `Command failed, ${formatException(exc)}`;
  },
  commandErrorResult: (err) => {
    return err.message;
  },
  currentVersionIsNotLatest: ({ currentVersion, latestVersion, upgradeCommand }) => {
    if (upgradeCommand) {
      return `Latest available version is ${latestVersion} (currently running ${currentVersion}), upgrade with "${upgradeCommand}"`;
    }
    return `Latest available version is ${latestVersion} (currently running ${currentVersion})`;
  }
};
function defaultTextLoader(locale) {
  if (locale.startsWith("en")) {
    return text_en;
  }
}
function shouldUseAnsiColor(process2, stream, config) {
  return !config.disableAnsiColor && !checkEnvironmentVariable(process2, "STRICLI_NO_COLOR") && (stream.getColorDepth?.(process2.env) ?? 1) >= 4;
}

// .reference/stricli/packages/core/src/routing/command/run.ts
async function runCommand({ loader, parameters }, {
  context,
  inputs,
  scannerConfig,
  errorFormatting,
  documentationConfig,
  determineExitCode
}) {
  let parsedArguments;
  try {
    const scanner = buildArgumentScanner(parameters, scannerConfig);
    for (const input of inputs) {
      scanner.next(input);
    }
    const result = await scanner.parseArguments(context);
    if (result.success) {
      parsedArguments = result.arguments;
    } else {
      const ansiColor = shouldUseAnsiColor(context.process, context.process.stderr, documentationConfig);
      for (const error of result.errors) {
        const errorMessage = errorFormatting.exceptionWhileParsingArguments(error, ansiColor);
        context.process.stderr.write(ansiColor ? `\x1B[1m\x1B[31m${errorMessage}\x1B[39m\x1B[22m
` : `${errorMessage}
`);
      }
      return ExitCode.InvalidArgument;
    }
  } catch (exc) {
    const ansiColor = shouldUseAnsiColor(context.process, context.process.stderr, documentationConfig);
    const errorMessage = errorFormatting.exceptionWhileParsingArguments(exc, ansiColor);
    context.process.stderr.write(ansiColor ? `\x1B[1m\x1B[31m${errorMessage}\x1B[39m\x1B[22m
` : `${errorMessage}
`);
    return ExitCode.InvalidArgument;
  }
  let commandFunction;
  try {
    const loaded = await loader();
    if (typeof loaded === "function") {
      commandFunction = loaded;
    } else {
      commandFunction = loaded.default;
    }
  } catch (exc) {
    const ansiColor = shouldUseAnsiColor(context.process, context.process.stderr, documentationConfig);
    const errorMessage = errorFormatting.exceptionWhileLoadingCommandFunction(exc, ansiColor);
    context.process.stderr.write(ansiColor ? `\x1B[1m\x1B[31m${errorMessage}\x1B[39m\x1B[22m
` : `${errorMessage}
`);
    return ExitCode.CommandLoadError;
  }
  try {
    const result = await commandFunction.call(context, ...parsedArguments);
    if (result instanceof Error) {
      const ansiColor = shouldUseAnsiColor(context.process, context.process.stderr, documentationConfig);
      const errorMessage = errorFormatting.commandErrorResult(result, ansiColor);
      context.process.stderr.write(ansiColor ? `\x1B[1m\x1B[31m${errorMessage}\x1B[39m\x1B[22m
` : `${errorMessage}
`);
      if (determineExitCode) {
        return determineExitCode(result);
      }
      return ExitCode.CommandRunError;
    }
  } catch (exc) {
    const ansiColor = shouldUseAnsiColor(context.process, context.process.stderr, documentationConfig);
    const errorMessage = errorFormatting.exceptionWhileRunningCommand(exc, ansiColor);
    context.process.stderr.write(ansiColor ? `\x1B[1m\x1B[31m${errorMessage}\x1B[39m\x1B[22m
` : `${errorMessage}
`);
    if (determineExitCode) {
      return determineExitCode(exc);
    }
    return ExitCode.CommandRunError;
  }
  return ExitCode.Success;
}

// .reference/stricli/packages/core/src/routing/route-map/types.ts
var RouteMapSymbol = Symbol("RouteMap");

// .reference/stricli/packages/core/src/routing/command/types.ts
var CommandSymbol = Symbol("Command");

// .reference/stricli/packages/core/src/routing/scanner.ts
function buildRouteScanner(root, config, startingPrefix) {
  const prefix = [...startingPrefix];
  const unprocessedInputs = [];
  let parent;
  let current = root;
  let target;
  let rootLevel = true;
  let helpRequested = false;
  return {
    next: (input) => {
      if (input === "--help" || input === "-h") {
        helpRequested = true;
        if (!target) {
          target = current;
        }
        return;
      } else if (input === "--helpAll" || input === "--help-all" || input === "-H") {
        helpRequested = "all";
        if (!target) {
          target = current;
        }
        return;
      }
      if (target) {
        unprocessedInputs.push(input);
        return;
      }
      if (current.kind === CommandSymbol) {
        target = current;
        unprocessedInputs.push(input);
        return;
      }
      const camelCaseRouteName = convertKebabCaseToCamelCase(input);
      let internalRouteName = input;
      let next = current.getRoutingTargetForInput(internalRouteName);
      if (config.caseStyle === "allow-kebab-for-camel" && !next) {
        next = current.getRoutingTargetForInput(camelCaseRouteName);
        if (next) {
          internalRouteName = camelCaseRouteName;
        }
      }
      if (!next) {
        const defaultCommand = current.getDefaultCommand();
        if (defaultCommand) {
          rootLevel = false;
          parent = [current, ""];
          unprocessedInputs.push(input);
          current = defaultCommand;
          return;
        }
        return { input, routeMap: current };
      }
      rootLevel = false;
      parent = [current, input];
      current = next;
      prefix.push(input);
    },
    finish: () => {
      target = target ?? current;
      if (target.kind === RouteMapSymbol && !helpRequested) {
        const defaultCommand = target.getDefaultCommand();
        if (defaultCommand) {
          parent = [target, ""];
          target = defaultCommand;
          rootLevel = false;
        }
      }
      const aliases = parent ? parent[0].getOtherAliasesForInput(parent[1], config.caseStyle) : { original: [], "convert-camel-to-kebab": [] };
      return {
        target,
        unprocessedInputs,
        helpRequested,
        prefix,
        rootLevel,
        aliases
      };
    }
  };
}

// .reference/stricli/packages/core/src/application/run.ts
async function runApplication({ root, defaultText, config }, rawInputs, context) {
  let text = defaultText;
  if (context.locale) {
    const localeText = config.localization.loadText(context.locale);
    if (localeText) {
      text = localeText;
    } else {
      const ansiColor = shouldUseAnsiColor(context.process, context.process.stderr, config.documentation);
      const warningMessage = text.noTextAvailableForLocale({
        requestedLocale: context.locale,
        defaultLocale: config.localization.defaultLocale,
        ansiColor
      });
      context.process.stderr.write(ansiColor ? `\x1B[1m\x1B[33m${warningMessage}\x1B[39m\x1B[22m
` : `${warningMessage}
`);
    }
  }
  if (config.versionInfo?.getLatestVersion && !checkEnvironmentVariable(context.process, "STRICLI_SKIP_VERSION_CHECK")) {
    let currentVersion;
    if ("currentVersion" in config.versionInfo) {
      currentVersion = config.versionInfo.currentVersion;
    } else {
      currentVersion = await config.versionInfo.getCurrentVersion.call(context);
    }
    const latestVersion = await config.versionInfo.getLatestVersion.call(context, currentVersion);
    if (latestVersion && currentVersion !== latestVersion) {
      const ansiColor = shouldUseAnsiColor(context.process, context.process.stderr, config.documentation);
      const warningMessage = text.currentVersionIsNotLatest({
        currentVersion,
        latestVersion,
        upgradeCommand: config.versionInfo.upgradeCommand,
        ansiColor
      });
      context.process.stderr.write(ansiColor ? `\x1B[1m\x1B[33m${warningMessage}\x1B[39m\x1B[22m
` : `${warningMessage}
`);
    }
  }
  const inputs = rawInputs.slice();
  if (config.versionInfo && (inputs[0] === "--version" || inputs[0] === "-v")) {
    let currentVersion;
    if ("currentVersion" in config.versionInfo) {
      currentVersion = config.versionInfo.currentVersion;
    } else {
      currentVersion = await config.versionInfo.getCurrentVersion.call(context);
    }
    context.process.stdout.write(currentVersion + `
`);
    return ExitCode.Success;
  }
  const scanner = buildRouteScanner(root, config.scanner, [config.name]);
  let error;
  while (inputs.length > 0 && !error) {
    const arg = inputs.shift();
    error = scanner.next(arg);
  }
  if (error) {
    const routeNames = listAllRouteNamesAndAliasesForScan(error.routeMap, config.scanner.caseStyle, config.completion);
    const corrections = filterClosestAlternatives(error.input, routeNames, config.scanner.distanceOptions).map((str) => `\`${str}\``);
    const ansiColor = shouldUseAnsiColor(context.process, context.process.stderr, config.documentation);
    const errorMessage = text.noCommandRegisteredForInput({ input: error.input, corrections, ansiColor });
    context.process.stderr.write(ansiColor ? `\x1B[1m\x1B[31m${errorMessage}\x1B[39m\x1B[22m
` : `${errorMessage}
`);
    return ExitCode.UnknownCommand;
  }
  const result = scanner.finish();
  if (result.helpRequested || result.target.kind === RouteMapSymbol) {
    const ansiColor = shouldUseAnsiColor(context.process, context.process.stdout, config.documentation);
    context.process.stdout.write(result.target.formatHelp({
      prefix: result.prefix,
      includeVersionFlag: Boolean(config.versionInfo) && result.rootLevel,
      includeArgumentEscapeSequenceFlag: config.scanner.allowArgumentEscapeSequence,
      includeHelpAllFlag: result.helpRequested === "all" || config.documentation.alwaysShowHelpAllFlag,
      includeHidden: result.helpRequested === "all",
      config: config.documentation,
      aliases: result.aliases[config.documentation.caseStyle],
      text,
      ansiColor
    }));
    return ExitCode.Success;
  }
  let commandContext;
  if ("forCommand" in context) {
    try {
      commandContext = await context.forCommand({ prefix: result.prefix });
    } catch (exc) {
      const ansiColor = shouldUseAnsiColor(context.process, context.process.stderr, config.documentation);
      const errorMessage = text.exceptionWhileLoadingCommandContext(exc, ansiColor);
      context.process.stderr.write(ansiColor ? `\x1B[1m\x1B[31m${errorMessage}\x1B[39m\x1B[22m` : errorMessage);
      return ExitCode.ContextLoadError;
    }
  } else {
    commandContext = context;
  }
  return runCommand(result.target, {
    context: commandContext,
    inputs: result.unprocessedInputs,
    scannerConfig: config.scanner,
    documentationConfig: config.documentation,
    errorFormatting: text,
    determineExitCode: config.determineExitCode
  });
}

// .reference/stricli/packages/core/src/config.ts
function formatForDisplay(flagName, displayCaseStyle) {
  if (displayCaseStyle === "convert-camel-to-kebab") {
    return convertCamelCaseToKebabCase(flagName);
  }
  return flagName;
}
function formatAsNegated(flagName, displayCaseStyle) {
  if (displayCaseStyle === "convert-camel-to-kebab") {
    return `no-${convertCamelCaseToKebabCase(flagName)}`;
  }
  return `no${flagName[0].toUpperCase()}${flagName.slice(1)}`;
}
function withDefaults(config) {
  const scannerCaseStyle = config.scanner?.caseStyle ?? "original";
  let displayCaseStyle;
  if (config.documentation?.caseStyle) {
    if (scannerCaseStyle === "original" && config.documentation.caseStyle === "convert-camel-to-kebab") {
      throw new InternalError("Cannot convert route and flag names on display but scan as original");
    }
    displayCaseStyle = config.documentation.caseStyle;
  } else if (scannerCaseStyle === "allow-kebab-for-camel") {
    displayCaseStyle = "convert-camel-to-kebab";
  } else {
    displayCaseStyle = scannerCaseStyle;
  }
  const scannerConfig = {
    caseStyle: scannerCaseStyle,
    allowArgumentEscapeSequence: config.scanner?.allowArgumentEscapeSequence ?? false,
    distanceOptions: config.scanner?.distanceOptions ?? {
      threshold: 7,
      weights: {
        insertion: 1,
        deletion: 3,
        substitution: 2,
        transposition: 0
      }
    }
  };
  const documentationConfig = {
    alwaysShowHelpAllFlag: config.documentation?.alwaysShowHelpAllFlag ?? false,
    useAliasInUsageLine: config.documentation?.useAliasInUsageLine ?? false,
    onlyRequiredInUsageLine: config.documentation?.onlyRequiredInUsageLine ?? false,
    caseStyle: displayCaseStyle,
    disableAnsiColor: config.documentation?.disableAnsiColor ?? false
  };
  const completionConfig = {
    includeAliases: config.completion?.includeAliases ?? documentationConfig.useAliasInUsageLine,
    includeHiddenRoutes: config.completion?.includeHiddenRoutes ?? false,
    ...config.completion
  };
  return {
    ...config,
    scanner: scannerConfig,
    completion: completionConfig,
    documentation: documentationConfig,
    localization: {
      defaultLocale: "en",
      loadText: defaultTextLoader,
      ...config.localization
    }
  };
}

// .reference/stricli/packages/core/src/application/builder.ts
function buildApplication(root, appConfig) {
  const config = withDefaults(appConfig);
  if (root.kind === CommandSymbol && config.versionInfo) {
    if (root.usesFlag("version")) {
      throw new InternalError("Unable to use command with flag --version as root when version info is supplied");
    }
    if (root.usesFlag("v")) {
      throw new InternalError("Unable to use command with alias -v as root when version info is supplied");
    }
  }
  const defaultText = config.localization.loadText(config.localization.defaultLocale);
  if (!defaultText) {
    throw new InternalError(`No text available for the default locale "${config.localization.defaultLocale}"`);
  }
  return {
    root,
    config,
    defaultText
  };
}
// .reference/stricli/packages/core/src/parameter/flag/types.ts
function hasDefault(flag) {
  return "default" in flag && typeof flag.default !== "undefined";
}
function isOptionalAtRuntime(flag) {
  return flag.optional ?? hasDefault(flag);
}

// .reference/stricli/packages/core/src/parameter/formatting.ts
function wrapRequiredFlag(text) {
  return `(${text})`;
}
function wrapOptionalFlag(text) {
  return `[${text}]`;
}
function wrapVariadicFlag(text) {
  return `${text}...`;
}
function wrapRequiredParameter(text) {
  return `<${text}>`;
}
function wrapOptionalParameter(text) {
  return `[<${text}>]`;
}
function wrapVariadicParameter(text) {
  return `<${text}>...`;
}
function formatUsageLineForParameters(parameters, args) {
  const flagsUsage = Object.entries(parameters.flags ?? {}).filter(([, flag]) => {
    if (flag.hidden) {
      return false;
    }
    if (args.config.onlyRequiredInUsageLine && isOptionalAtRuntime(flag)) {
      return false;
    }
    return true;
  }).map(([name, flag]) => {
    let displayName = args.config.caseStyle === "convert-camel-to-kebab" ? `--${convertCamelCaseToKebabCase(name)}` : `--${name}`;
    if (parameters.aliases && args.config.useAliasInUsageLine) {
      const aliases = Object.entries(parameters.aliases).filter((entry) => entry[1] === name);
      if (aliases.length === 1 && aliases[0]) {
        displayName = `-${aliases[0][0]}`;
      }
    }
    if (flag.kind === "boolean") {
      return [flag, displayName];
    }
    if (flag.kind === "enum" && typeof flag.placeholder !== "string") {
      return [flag, `${displayName} ${flag.values.join("|")}`];
    }
    const placeholder = flag.placeholder ?? "value";
    return [flag, `${displayName} ${placeholder}`];
  }).map(([flag, usage]) => {
    if (flag.kind === "parsed" && flag.variadic) {
      if (isOptionalAtRuntime(flag)) {
        return wrapVariadicFlag(wrapOptionalFlag(usage));
      }
      return wrapVariadicFlag(wrapRequiredFlag(usage));
    }
    if (isOptionalAtRuntime(flag)) {
      return wrapOptionalFlag(usage);
    }
    return wrapRequiredFlag(usage);
  });
  let positionalUsage = [];
  const positional = parameters.positional;
  if (positional) {
    if (positional.kind === "array") {
      positionalUsage = [wrapVariadicParameter(positional.parameter.placeholder ?? "args")];
    } else {
      let parameters2 = positional.parameters;
      if (args.config.onlyRequiredInUsageLine) {
        parameters2 = parameters2.filter((param) => !param.optional && typeof param.default === "undefined");
      }
      positionalUsage = parameters2.map((param, i) => {
        const argName = param.placeholder ?? `arg${i + 1}`;
        return param.optional || typeof param.default !== "undefined" ? wrapOptionalParameter(argName) : wrapRequiredParameter(argName);
      });
    }
  }
  return [...args.prefix, ...flagsUsage, ...positionalUsage].join(" ");
}

// .reference/stricli/packages/core/src/parameter/flag/formatting.ts
function formatDocumentationForFlagParameters(flags, aliases, args) {
  const { keywords, briefs } = args.text;
  const visibleFlags = Object.entries(flags).filter(([, flag]) => {
    if (flag.hidden && !args.includeHidden) {
      return false;
    }
    return true;
  });
  const atLeastOneOptional = visibleFlags.some(([, flag]) => isOptionalAtRuntime(flag));
  const rows = visibleFlags.map(([name, flag]) => {
    const aliasStrings = Object.entries(aliases).filter((entry) => entry[1] === name).map(([alias]) => `-${alias}`);
    let flagName = "--" + formatForDisplay(name, args.config.caseStyle);
    if (flag.kind === "boolean" && flag.default !== false && flag.withNegated !== false) {
      const negatedFlagName = formatAsNegated(name, args.config.caseStyle);
      flagName = `${flagName}/--${negatedFlagName}`;
    }
    if (isOptionalAtRuntime(flag)) {
      flagName = `[${flagName}]`;
    } else if (atLeastOneOptional) {
      flagName = ` ${flagName}`;
    }
    if (flag.kind === "parsed" && flag.variadic) {
      flagName = `${flagName}...`;
    }
    const suffixParts = [];
    if (flag.kind === "enum") {
      const choices = flag.values.join("|");
      suffixParts.push(choices);
    }
    if (hasDefault(flag)) {
      const defaultKeyword = args.ansiColor ? `\x1B[2m${keywords.default}\x1B[22m` : keywords.default;
      let defaultValue;
      if (Array.isArray(flag.default)) {
        if (flag.default.length === 0) {
          defaultValue = "[]";
        } else {
          const separator = "variadic" in flag && typeof flag.variadic === "string" ? flag.variadic : " ";
          defaultValue = flag.default.join(separator);
        }
      } else {
        defaultValue = flag.default === "" ? `""` : String(flag.default);
      }
      suffixParts.push(`${defaultKeyword} ${defaultValue}`);
    }
    if ("variadic" in flag && typeof flag.variadic === "string") {
      const separatorKeyword = args.ansiColor ? `\x1B[2m${keywords.separator}\x1B[22m` : keywords.separator;
      suffixParts.push(`${separatorKeyword} ${flag.variadic}`);
    }
    const suffix = suffixParts.length > 0 ? `[${suffixParts.join(", ")}]` : undefined;
    return {
      aliases: aliasStrings.join(" "),
      flagName,
      brief: flag.brief,
      suffix,
      hidden: flag.hidden
    };
  });
  rows.push({
    aliases: "-h",
    flagName: atLeastOneOptional ? " --help" : "--help",
    brief: briefs.help
  });
  if (args.includeHelpAllFlag) {
    const helpAllFlagName = formatForDisplay("helpAll", args.config.caseStyle);
    rows.push({
      aliases: "-H",
      flagName: atLeastOneOptional ? ` --${helpAllFlagName}` : `--${helpAllFlagName}`,
      brief: briefs.helpAll,
      hidden: !args.config.alwaysShowHelpAllFlag
    });
  }
  if (args.includeVersionFlag) {
    rows.push({
      aliases: "-v",
      flagName: atLeastOneOptional ? " --version" : "--version",
      brief: briefs.version
    });
  }
  if (args.includeArgumentEscapeSequenceFlag) {
    rows.push({
      aliases: "",
      flagName: atLeastOneOptional ? " --" : "--",
      brief: briefs.argumentEscapeSequence
    });
  }
  return formatRowsWithColumns(rows.map((row) => {
    if (!args.ansiColor) {
      return [row.aliases, row.flagName, row.brief, row.suffix ?? ""];
    }
    return [
      row.hidden ? `\x1B[2m${row.aliases}\x1B[22m` : `\x1B[1m${row.aliases}\x1B[22m`,
      row.hidden ? `\x1B[2m${row.flagName}\x1B[22m` : `\x1B[1m${row.flagName}\x1B[22m`,
      row.hidden ? `\x1B[2;3m${row.brief}\x1B[22;23m` : `\x1B[;;3m${row.brief}\x1B[;;;23m`,
      row.suffix ?? ""
    ];
  }), [" ", "  ", " "]);
}
function* generateBuiltInFlagUsageLines(args) {
  yield args.config.useAliasInUsageLine ? "-h" : "--help";
  if (args.includeHelpAllFlag) {
    const helpAllFlagName = formatForDisplay("helpAll", args.config.caseStyle);
    yield args.config.useAliasInUsageLine ? "-H" : `--${helpAllFlagName}`;
  }
  if (args.includeVersionFlag) {
    yield args.config.useAliasInUsageLine ? "-v" : "--version";
  }
}

// .reference/stricli/packages/core/src/parameter/positional/formatting.ts
function formatDocumentationForPositionalParameters(positional, args) {
  if (positional.kind === "array") {
    const name = positional.parameter.placeholder ?? "args";
    const argName = args.ansiColor ? `\x1B[1m${name}...\x1B[22m` : `${name}...`;
    const brief = args.ansiColor ? `\x1B[3m${positional.parameter.brief}\x1B[23m` : positional.parameter.brief;
    return formatRowsWithColumns([[argName, brief]], ["  "]);
  }
  const { keywords } = args.text;
  const atLeastOneOptional = positional.parameters.some((def) => def.optional);
  return formatRowsWithColumns(positional.parameters.map((def, i) => {
    let name = def.placeholder ?? `arg${i + 1}`;
    let suffix;
    if (def.optional) {
      name = `[${name}]`;
    } else if (atLeastOneOptional) {
      name = ` ${name}`;
    }
    if (def.default) {
      const defaultKeyword = args.ansiColor ? `\x1B[2m${keywords.default}\x1B[22m` : keywords.default;
      suffix = `[${defaultKeyword} ${def.default}]`;
    }
    return [
      args.ansiColor ? `\x1B[1m${name}\x1B[22m` : name,
      args.ansiColor ? `\x1B[3m${def.brief}\x1B[23m` : def.brief,
      suffix ?? ""
    ];
  }), ["  ", " "]);
}

// .reference/stricli/packages/core/src/routing/command/documentation.ts
function* generateCommandHelpLines(parameters, docs, args) {
  const { brief, fullDescription, customUsage } = docs;
  const { headers } = args.text;
  const prefix = args.prefix.join(" ");
  yield args.ansiColor ? `\x1B[4m${headers.usage}\x1B[24m` : headers.usage;
  if (customUsage) {
    for (const usage of customUsage) {
      if (typeof usage === "string") {
        yield `  ${prefix} ${usage}`;
      } else {
        const brief2 = args.ansiColor ? `\x1B[3m${usage.brief}\x1B[23m` : usage.brief;
        yield `  ${prefix} ${usage.input}
    ${brief2}`;
      }
    }
  } else {
    yield `  ${formatUsageLineForParameters(parameters, args)}`;
  }
  for (const line of generateBuiltInFlagUsageLines(args)) {
    yield `  ${prefix} ${line}`;
  }
  yield "";
  yield fullDescription ?? brief;
  if (args.aliases && args.aliases.length > 0) {
    const aliasPrefix = args.prefix.slice(0, -1).join(" ");
    yield "";
    yield args.ansiColor ? `\x1B[4m${headers.aliases}\x1B[24m` : headers.aliases;
    for (const alias of args.aliases) {
      yield `  ${aliasPrefix} ${alias}`;
    }
  }
  yield "";
  yield args.ansiColor ? `\x1B[4m${headers.flags}\x1B[24m` : headers.flags;
  for (const line of formatDocumentationForFlagParameters(parameters.flags ?? {}, parameters.aliases ?? {}, args)) {
    yield `  ${line}`;
  }
  const positional = parameters.positional ?? { kind: "tuple", parameters: [] };
  if (positional.kind === "array" || positional.parameters.length > 0) {
    yield "";
    yield args.ansiColor ? `\x1B[4m${headers.arguments}\x1B[24m` : headers.arguments;
    for (const line of formatDocumentationForPositionalParameters(positional, args)) {
      yield `  ${line}`;
    }
  }
}

// .reference/stricli/packages/core/src/routing/command/builder.ts
function checkForReservedFlags(flags, reserved) {
  for (const flag of reserved) {
    if (flag in flags) {
      throw new InternalError(`Unable to use reserved flag --${flag}`);
    }
  }
}
function checkForReservedAliases(aliases, reserved) {
  for (const alias of reserved) {
    if (alias in aliases) {
      throw new InternalError(`Unable to use reserved alias -${alias}`);
    }
  }
}
function* asNegationFlagNames(flagName) {
  yield `no-${convertCamelCaseToKebabCase(flagName)}`;
  yield `no${flagName[0].toUpperCase()}${flagName.slice(1)}`;
}
function checkForNegationCollisions(flags) {
  const flagsAllowingNegation = Object.entries(flags).filter(([, flag]) => flag.kind === "boolean" && !flag.optional);
  for (const [internalFlagName] of flagsAllowingNegation) {
    for (const negatedFlagName of asNegationFlagNames(internalFlagName)) {
      if (negatedFlagName in flags) {
        throw new InternalError(`Unable to allow negation for --${internalFlagName} as it conflicts with --${negatedFlagName}`);
      }
    }
  }
}
function checkForInvalidVariadicSeparators(flags) {
  for (const [internalFlagName, flag] of Object.entries(flags)) {
    if ("variadic" in flag && typeof flag.variadic === "string") {
      if (flag.variadic.length < 1) {
        throw new InternalError(`Unable to use "" as variadic separator for --${internalFlagName} as it is empty`);
      }
      if (/\s/.test(flag.variadic)) {
        throw new InternalError(`Unable to use "${flag.variadic}" as variadic separator for --${internalFlagName} as it contains whitespace`);
      }
    }
  }
}
function buildCommand(builderArgs) {
  const { flags = {}, aliases = {} } = builderArgs.parameters;
  checkForReservedFlags(flags, ["help", "helpAll", "help-all"]);
  checkForReservedAliases(aliases, ["h", "H"]);
  checkForNegationCollisions(flags);
  checkForInvalidVariadicSeparators(flags);
  let loader;
  if ("func" in builderArgs) {
    loader = async () => builderArgs.func;
  } else {
    loader = builderArgs.loader;
  }
  return {
    kind: CommandSymbol,
    loader,
    parameters: builderArgs.parameters,
    get brief() {
      return builderArgs.docs.brief;
    },
    get fullDescription() {
      return builderArgs.docs.fullDescription;
    },
    formatUsageLine: (args) => {
      return formatUsageLineForParameters(builderArgs.parameters, args);
    },
    formatHelp: (args) => {
      const lines = [
        ...generateCommandHelpLines(builderArgs.parameters, builderArgs.docs, args)
      ];
      const text = lines.join(`
`);
      return text + `
`;
    },
    usesFlag: (flagName) => {
      return Boolean(flagName in flags || flagName in aliases);
    }
  };
}
// .reference/stricli/packages/core/src/routing/route-map/documentation.ts
function* generateRouteMapHelpLines(routes, docs, args) {
  const { brief, fullDescription, hideRoute } = docs;
  const { headers } = args.text;
  yield args.ansiColor ? `\x1B[4m${headers.usage}\x1B[24m` : headers.usage;
  for (const [name, route] of Object.entries(routes)) {
    if (!hideRoute || !hideRoute[name] || args.includeHidden) {
      const externalRouteName = args.config.caseStyle === "convert-camel-to-kebab" ? convertCamelCaseToKebabCase(name) : name;
      yield `  ${route.formatUsageLine({
        ...args,
        prefix: [...args.prefix, externalRouteName]
      })}`;
    }
  }
  const prefix = args.prefix.join(" ");
  for (const line of generateBuiltInFlagUsageLines(args)) {
    yield `  ${prefix} ${line}`;
  }
  yield "";
  yield fullDescription ?? brief;
  if (args.aliases && args.aliases.length > 0) {
    const aliasPrefix = args.prefix.slice(0, -1).join(" ");
    yield "";
    yield args.ansiColor ? `\x1B[4m${headers.aliases}\x1B[24m` : headers.aliases;
    for (const alias of args.aliases) {
      yield `  ${aliasPrefix} ${alias}`;
    }
  }
  yield "";
  yield args.ansiColor ? `\x1B[4m${headers.flags}\x1B[24m` : headers.flags;
  for (const line of formatDocumentationForFlagParameters({}, {}, args)) {
    yield `  ${line}`;
  }
  yield "";
  yield args.ansiColor ? `\x1B[4m${headers.commands}\x1B[24m` : headers.commands;
  const visibleRoutes = Object.entries(routes).filter(([name]) => !hideRoute || !hideRoute[name] || args.includeHidden);
  const rows = visibleRoutes.map(([internalRouteName, route]) => {
    const externalRouteName = formatForDisplay(internalRouteName, args.config.caseStyle);
    return {
      routeName: externalRouteName,
      brief: route.brief,
      hidden: hideRoute && hideRoute[internalRouteName]
    };
  });
  const formattedRows = formatRowsWithColumns(rows.map((row) => {
    if (!args.ansiColor) {
      return [row.routeName, row.brief];
    }
    return [
      row.hidden ? `\x1B[2m${row.routeName}\x1B[22m` : `\x1B[1m${row.routeName}\x1B[32m`,
      row.hidden ? `\x1B[2;3m${row.brief}\x1B[22;23m` : `\x1B[;;3m${row.brief}\x1B[;;;23m`
    ];
  }), ["  "]);
  for (const line of formattedRows) {
    yield `  ${line}`;
  }
}

// .reference/stricli/packages/core/src/routing/route-map/builder.ts
function buildRouteMap({
  routes,
  defaultCommand: defaultCommandRoute,
  docs,
  aliases
}) {
  if (Object.entries(routes).length === 0) {
    throw new InternalError("Route map must contain at least one route");
  }
  const activeAliases = aliases ?? {};
  const aliasesByRoute = new Map;
  for (const [alias, routeName] of Object.entries(activeAliases)) {
    if (alias in routes) {
      throw new InternalError(`Cannot use "${alias}" as an alias when a route with that name already exists`);
    }
    const routeAliases = aliasesByRoute.get(routeName) ?? [];
    aliasesByRoute.set(routeName, [...routeAliases, alias]);
  }
  const defaultCommand = defaultCommandRoute ? routes[defaultCommandRoute] : undefined;
  if (defaultCommand && defaultCommand.kind === RouteMapSymbol) {
    throw new InternalError(`Cannot use "${defaultCommandRoute}" as the default command because it is not a Command`);
  }
  const resolveRouteName = (input) => {
    if (input in activeAliases) {
      return activeAliases[input];
    } else if (input in routes) {
      return input;
    }
  };
  return {
    kind: RouteMapSymbol,
    get brief() {
      return docs.brief;
    },
    get fullDescription() {
      return docs.fullDescription;
    },
    formatUsageLine(args) {
      const routeNames = this.getAllEntries().filter((entry) => !entry.hidden).map((entry) => entry.name[args.config.caseStyle]);
      return `${args.prefix.join(" ")} ${routeNames.join("|")} ...`;
    },
    formatHelp: (config) => {
      const lines = [...generateRouteMapHelpLines(routes, docs, config)];
      const text = lines.join(`
`);
      return text + `
`;
    },
    getDefaultCommand: () => {
      return defaultCommand;
    },
    getOtherAliasesForInput: (input, caseStyle) => {
      if (defaultCommandRoute) {
        if (input === defaultCommandRoute) {
          return {
            original: [""],
            "convert-camel-to-kebab": [""]
          };
        }
        if (input === "") {
          return {
            original: [defaultCommandRoute],
            "convert-camel-to-kebab": [defaultCommandRoute]
          };
        }
      }
      const camelInput = convertKebabCaseToCamelCase(input);
      let routeName = resolveRouteName(input);
      if (!routeName && caseStyle === "allow-kebab-for-camel") {
        routeName = resolveRouteName(camelInput);
      }
      if (!routeName) {
        return {
          original: [],
          "convert-camel-to-kebab": []
        };
      }
      const otherAliases = [routeName, ...aliasesByRoute.get(routeName) ?? []].filter((alias) => alias !== input && alias !== camelInput);
      return {
        original: otherAliases,
        "convert-camel-to-kebab": otherAliases.map(convertCamelCaseToKebabCase)
      };
    },
    getRoutingTargetForInput: (input) => {
      const routeName = input in activeAliases ? activeAliases[input] : input;
      return routes[routeName];
    },
    getAllEntries() {
      const hiddenRoutes = docs.hideRoute;
      return Object.entries(routes).map(([originalRouteName, target]) => {
        return {
          name: {
            original: originalRouteName,
            "convert-camel-to-kebab": convertCamelCaseToKebabCase(originalRouteName)
          },
          target,
          aliases: aliasesByRoute.get(originalRouteName) ?? [],
          hidden: hiddenRoutes?.[originalRouteName] ?? false
        };
      });
    }
  };
}
// index.ts
var import_taskwarrior_lib = __toESM(require_dist(), 1);
var COMMAND_NAME = "task-agent";
var EXIT_CODE = {
  validation: 1,
  notFound: 2,
  environment: 3,
  taskwarrior: 4
};
var STATUS_VALUES = ["pending", "waiting", "deleted", "completed", "recurring"];
var OPEN_STATUS_VALUES = ["pending", "waiting"];
var PRIORITY_VALUES = ["H", "M", "L"];
var PRIORITY_FILTER_VALUES = ["H", "M", "L", "none"];
var SORT_VALUES = ["entry", "modified", "due", "scheduled", "project", "priority", "description"];
var MUTABLE_SCALAR_FIELDS = ["description", "project", "priority", "due", "wait", "scheduled", "until", "recur"];
var CORE_TASK_FIELDS = new Set([
  "id",
  "status",
  "uuid",
  "entry",
  "description",
  "start",
  "end",
  "due",
  "until",
  "wait",
  "modified",
  "scheduled",
  "recur",
  "mask",
  "imask",
  "parent",
  "project",
  "priority",
  "depends",
  "tags",
  "annotations"
]);
var UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class CliError extends Error {
  code;
  exitCode;
  details;
  constructor(code, message, exitCode, details) {
    super(message);
    this.name = "CliError";
    this.code = code;
    this.exitCode = exitCode;
    this.details = details;
  }
}
function writeJson(value) {
  process.stdout.write(JSON.stringify(value) + `
`);
}
function errorPayload(error) {
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...error.details === undefined ? {} : { details: error.details }
    }
  };
}
function toCliError(error, fallbackCode = "TASKWARRIOR_ERROR", fallbackExitCode = EXIT_CODE.taskwarrior) {
  if (error instanceof CliError) {
    return error;
  }
  if (error instanceof import_taskwarrior_lib.TaskError) {
    return new CliError(fallbackCode, error.message || "Taskwarrior command failed", fallbackExitCode);
  }
  if (error instanceof Error) {
    return new CliError(fallbackCode, error.message || "Command failed", fallbackExitCode);
  }
  return new CliError(fallbackCode, "Command failed", fallbackExitCode, { cause: error });
}
function formatErrorJson(error, fallbackCode = "TASKWARRIOR_ERROR", fallbackExitCode = EXIT_CODE.taskwarrior) {
  return JSON.stringify(errorPayload(toCliError(error, fallbackCode, fallbackExitCode)));
}
function normalizeExitCode(exitCode) {
  if (exitCode >= 0) {
    return exitCode;
  }
  if (exitCode === -4 || exitCode === -5) {
    return EXIT_CODE.validation;
  }
  if (exitCode === -3) {
    return EXIT_CODE.environment;
  }
  return EXIT_CODE.taskwarrior;
}
function determineExitCode(error) {
  return toCliError(error).exitCode;
}
var appText = {
  ...text_en,
  noCommandRegisteredForInput: ({ input, corrections }) => {
    return formatErrorJson(new CliError("UNKNOWN_COMMAND", `Unknown command '${input}'`, EXIT_CODE.validation, { corrections }), "UNKNOWN_COMMAND", EXIT_CODE.validation);
  },
  noTextAvailableForLocale: ({ requestedLocale, defaultLocale }) => {
    return formatErrorJson(new CliError("UNSUPPORTED_LOCALE", `Unsupported locale '${requestedLocale}'`, EXIT_CODE.environment, {
      defaultLocale
    }), "UNSUPPORTED_LOCALE", EXIT_CODE.environment);
  },
  exceptionWhileParsingArguments: (error) => {
    return formatErrorJson(error, "INVALID_ARGUMENT", EXIT_CODE.validation);
  },
  exceptionWhileLoadingCommandFunction: (error) => {
    return formatErrorJson(error, "COMMAND_LOAD_ERROR", EXIT_CODE.taskwarrior);
  },
  exceptionWhileLoadingCommandContext: (error) => {
    return formatErrorJson(error, "CONTEXT_LOAD_ERROR", EXIT_CODE.environment);
  },
  exceptionWhileRunningCommand: (error) => {
    return formatErrorJson(error, "COMMAND_FAILED", EXIT_CODE.taskwarrior);
  },
  commandErrorResult: (error) => {
    return formatErrorJson(error, "COMMAND_FAILED", EXIT_CODE.taskwarrior);
  },
  currentVersionIsNotLatest: ({ currentVersion, latestVersion, upgradeCommand }) => {
    return JSON.stringify({
      ok: true,
      warning: {
        code: "NEW_VERSION_AVAILABLE",
        currentVersion,
        latestVersion,
        upgradeCommand
      }
    });
  }
};
function createTaskwarrior() {
  return new import_taskwarrior_lib.TaskwarriorLib;
}
function ensureTaskBinary() {
  try {
    return execFileSync("task", ["_version"], { encoding: "utf8" }).trim();
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new CliError("TASK_BINARY_UNAVAILABLE", "Taskwarrior binary 'task' is not installed or not on PATH", EXIT_CODE.environment);
    }
    throw new CliError("TASK_BINARY_UNAVAILABLE", "Taskwarrior binary 'task' could not be executed", EXIT_CODE.environment);
  }
}
function requireTaskwarrior() {
  const version = ensureTaskBinary();
  return {
    version,
    taskwarrior: createTaskwarrior()
  };
}
function trimTaskOutput(value) {
  return value?.trim() || undefined;
}
function resolveCalc(taskwarrior, expression, field) {
  try {
    const resolved = trimTaskOutput(taskwarrior.calc(expression));
    if (!resolved) {
      throw new CliError("INVALID_DATE_EXPRESSION", `Unable to resolve ${field}`, EXIT_CODE.validation, {
        expression,
        field
      });
    }
    return resolved;
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }
    throw new CliError("INVALID_DATE_EXPRESSION", `Unable to resolve ${field}`, EXIT_CODE.validation, {
      expression,
      field
    });
  }
}
function parseTaskDate(value) {
  if (!value) {
    return;
  }
  const trimmed = value.trim();
  const compact = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(trimmed);
  if (compact) {
    const year = compact[1];
    const month = compact[2];
    const day = compact[3];
    const hour = compact[4];
    const minute = compact[5];
    const second = compact[6];
    return Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  }
  const isoLike = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z)?$/.exec(trimmed);
  if (isoLike) {
    const year = isoLike[1];
    const month = isoLike[2];
    const day = isoLike[3];
    const hour = isoLike[4];
    const minute = isoLike[5];
    const second = isoLike[6];
    const zulu = isoLike[7] ?? "";
    return Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}${zulu}`);
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? undefined : parsed;
}
function getNowEpoch() {
  return Date.now();
}
function isClosed(task) {
  return task.status === "completed" || task.status === "deleted";
}
function getDepends(task) {
  const depends = task.depends;
  if (!Array.isArray(depends)) {
    return [];
  }
  return depends.filter((value) => typeof value === "string");
}
function getTags(task) {
  const tags = task.tags;
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags.filter((value) => typeof value === "string");
}
function getAnnotations(task) {
  const annotations = task.annotations;
  if (!Array.isArray(annotations)) {
    return [];
  }
  return annotations.filter((value) => {
    return Boolean(value) && typeof value === "object" && typeof value.description === "string";
  });
}
function buildTaskIndex(tasks) {
  const index = new Map;
  for (const task of tasks) {
    if (typeof task.uuid === "string" && task.uuid.length > 0) {
      index.set(task.uuid, task);
    }
  }
  return index;
}
function isBlocked(task, taskIndex) {
  if (isClosed(task)) {
    return false;
  }
  return getDepends(task).some((uuid) => {
    const dependency = taskIndex.get(uuid);
    if (!dependency) {
      return true;
    }
    return !isClosed(dependency);
  });
}
function isBlocking(task, tasks) {
  const taskUuid = task.uuid;
  if (isClosed(task) || typeof taskUuid !== "string") {
    return false;
  }
  return tasks.some((candidate) => {
    if (candidate.uuid === taskUuid || isClosed(candidate)) {
      return false;
    }
    return getDepends(candidate).includes(taskUuid);
  });
}
function isActive(task) {
  return !isClosed(task) && typeof task.start === "string" && task.start.length > 0;
}
function isWaiting(task, nowEpoch) {
  if (task.status === "waiting") {
    return true;
  }
  const waitEpoch = parseTaskDate(task.wait);
  return task.status === "pending" && waitEpoch !== undefined && waitEpoch > nowEpoch;
}
function isReady(task, taskIndex, nowEpoch) {
  if (task.status !== "pending") {
    return false;
  }
  if (isWaiting(task, nowEpoch) || isBlocked(task, taskIndex)) {
    return false;
  }
  const scheduledEpoch = parseTaskDate(task.scheduled);
  return scheduledEpoch === undefined || scheduledEpoch <= nowEpoch;
}
function isOverdue(task, nowEpoch) {
  if (isClosed(task)) {
    return false;
  }
  const dueEpoch = parseTaskDate(task.due);
  return dueEpoch !== undefined && dueEpoch < nowEpoch;
}
function extractUdas(task) {
  const udas = {};
  for (const [key, value] of Object.entries(task)) {
    if (!CORE_TASK_FIELDS.has(key)) {
      udas[key] = value;
    }
  }
  return udas;
}
function enrichTask(task, tasks, taskIndex) {
  const nowEpoch = getNowEpoch();
  return {
    ...task,
    meta: {
      active: isActive(task),
      blocked: isBlocked(task, taskIndex),
      blocking: isBlocking(task, tasks),
      overdue: isOverdue(task, nowEpoch),
      ready: isReady(task, taskIndex, nowEpoch)
    },
    udas: extractUdas(task)
  };
}
function serializeTasks(tasks) {
  const taskIndex = buildTaskIndex(tasks);
  return tasks.map((task) => enrichTask(task, tasks, taskIndex));
}
function serializeTask(task, snapshot) {
  return enrichTask(task, snapshot, buildTaskIndex(snapshot));
}
function loadTasks(taskwarrior) {
  try {
    return taskwarrior.load("");
  } catch (error) {
    throw toCliError(error);
  }
}
function loadFlatConfig(taskwarrior) {
  try {
    const rawConfig = taskwarrior.executeCommand("_show");
    const config = {};
    for (const line of rawConfig.split(/\r?\n/)) {
      if (!line) {
        continue;
      }
      const separator = line.indexOf("=");
      if (separator < 0) {
        continue;
      }
      const key = line.slice(0, separator);
      const value = line.slice(separator + 1);
      config[key] = value;
    }
    return config;
  } catch (error) {
    throw toCliError(error);
  }
}
function loadUdaDefinitions(taskwarrior) {
  const definitions = new Map;
  const flatConfig = loadFlatConfig(taskwarrior);
  for (const [key, value] of Object.entries(flatConfig)) {
    const match = /^uda\.(.+)\.(type|label|values|default)$/.exec(key);
    if (!match) {
      continue;
    }
    const name = match[1];
    const property = match[2];
    if (!name || !property) {
      continue;
    }
    const current = definitions.get(name) ?? { name };
    if (property === "type") {
      definitions.set(name, { ...current, type: value });
      continue;
    }
    if (property === "label") {
      definitions.set(name, { ...current, label: value });
      continue;
    }
    if (property === "default") {
      definitions.set(name, { ...current, defaultValue: value });
      continue;
    }
    const rawValues = value.split(",");
    definitions.set(name, {
      ...current,
      values: rawValues.filter((item) => item.length > 0),
      allowBlank: rawValues.some((item) => item.length === 0)
    });
  }
  return [...definitions.values()].sort((left, right) => left.name.localeCompare(right.name));
}
function makeUdaDefinitionMap(definitions) {
  return new Map(definitions.map((definition) => [definition.name, definition]));
}
function validateUdaValue(definition, value) {
  if (definition.type === "numeric") {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      throw new CliError("INVALID_UDA_VALUE", `UDA '${definition.name}' expects a numeric value`, EXIT_CODE.validation, {
        uda: definition.name,
        value
      });
    }
  }
  if (definition.values && definition.values.length > 0) {
    const isAllowed = definition.values.includes(value) || definition.allowBlank && value === "";
    if (!isAllowed) {
      throw new CliError("INVALID_UDA_VALUE", `UDA '${definition.name}' value is not allowed`, EXIT_CODE.validation, {
        uda: definition.name,
        value,
        allowedValues: definition.values,
        allowBlank: definition.allowBlank ?? false
      });
    }
  }
}
function parseUdaAssignments(rawAssignments, definitions) {
  const assignments = {};
  if (!rawAssignments || rawAssignments.length === 0) {
    return assignments;
  }
  const definitionMap = makeUdaDefinitionMap(definitions);
  for (const rawAssignment of rawAssignments) {
    const separator = rawAssignment.indexOf("=");
    if (separator <= 0) {
      throw new CliError("INVALID_UDA_ASSIGNMENT", "UDA assignments must use key=value", EXIT_CODE.validation, {
        value: rawAssignment
      });
    }
    const key = rawAssignment.slice(0, separator).trim();
    const value = rawAssignment.slice(separator + 1);
    if (!key) {
      throw new CliError("INVALID_UDA_ASSIGNMENT", "UDA assignment key cannot be empty", EXIT_CODE.validation, {
        value: rawAssignment
      });
    }
    const definition = definitionMap.get(key);
    if (!definition) {
      throw new CliError("UNKNOWN_UDA", `UDA '${key}' is not configured in Taskwarrior`, EXIT_CODE.validation, {
        uda: key
      });
    }
    validateUdaValue(definition, value);
    assignments[key] = value;
  }
  return assignments;
}
function validateClearUdas(rawKeys, definitions) {
  const keys = rawKeys?.map((key) => key.trim()).filter((key) => key.length > 0) ?? [];
  if (keys.length === 0) {
    return [];
  }
  const definitionMap = makeUdaDefinitionMap(definitions);
  for (const key of keys) {
    if (!definitionMap.has(key)) {
      throw new CliError("UNKNOWN_UDA", `UDA '${key}' is not configured in Taskwarrior`, EXIT_CODE.validation, {
        uda: key
      });
    }
  }
  return [...new Set(keys)];
}
function stringArray(values) {
  return values?.map((value) => value.trim()).filter((value) => value.length > 0) ?? [];
}
function positiveIntegerParser(input) {
  const parsed = numberParser(input);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliError("INVALID_INTEGER", "Expected a positive integer", EXIT_CODE.validation, { input });
  }
  return parsed;
}
function nonNegativeIntegerParser(input) {
  const parsed = numberParser(input);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new CliError("INVALID_INTEGER", "Expected a non-negative integer", EXIT_CODE.validation, { input });
  }
  return parsed;
}
function normalizeUuid(uuid) {
  const normalized = uuid.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw new CliError("INVALID_UUID", `Invalid UUID '${uuid}'`, EXIT_CODE.validation, { uuid });
  }
  return normalized;
}
function normalizeUuidList(values) {
  return [...new Set((values ?? []).map(normalizeUuid))];
}
function requireTaskByUuid(tasks, uuid) {
  const task = tasks.find((candidate) => candidate.uuid === uuid);
  if (!task) {
    throw new CliError("TASK_NOT_FOUND", `Task '${uuid}' was not found`, EXIT_CODE.notFound, { uuid });
  }
  return task;
}
function comparePriority(left, right) {
  const rank = { H: 3, M: 2, L: 1 };
  return (rank[left ?? ""] ?? 0) - (rank[right ?? ""] ?? 0);
}
function sortTasks(tasks, sortField, descending) {
  const field = sortField ?? "due";
  const sorted = [...tasks].sort((left, right) => {
    let comparison = 0;
    if (field === "priority") {
      comparison = comparePriority(left.priority, right.priority);
    } else if (field === "description") {
      comparison = (left.description ?? "").localeCompare(right.description ?? "");
    } else if (field === "project") {
      comparison = (left.project ?? "").localeCompare(right.project ?? "");
    } else if (field === "modified") {
      comparison = (parseTaskDate(left.modified) ?? Number.MIN_SAFE_INTEGER) - (parseTaskDate(right.modified) ?? Number.MIN_SAFE_INTEGER);
    } else if (field === "entry") {
      comparison = (parseTaskDate(left.entry) ?? Number.MIN_SAFE_INTEGER) - (parseTaskDate(right.entry) ?? Number.MIN_SAFE_INTEGER);
    } else if (field === "scheduled") {
      comparison = (parseTaskDate(left.scheduled) ?? Number.MAX_SAFE_INTEGER) - (parseTaskDate(right.scheduled) ?? Number.MAX_SAFE_INTEGER);
    } else {
      comparison = (parseTaskDate(left.due) ?? Number.MAX_SAFE_INTEGER) - (parseTaskDate(right.due) ?? Number.MAX_SAFE_INTEGER);
    }
    if (comparison === 0) {
      comparison = (left.description ?? "").localeCompare(right.description ?? "");
    }
    return descending ? -comparison : comparison;
  });
  return sorted;
}
function defaultListStatuses(statuses) {
  return statuses && statuses.length > 0 ? statuses : OPEN_STATUS_VALUES;
}
function applyListFilters(tasks, taskwarrior, flags) {
  const taskIndex = buildTaskIndex(tasks);
  const nowEpoch = getNowEpoch();
  const dueBeforeEpoch = flags.dueBefore ? parseTaskDate(resolveCalc(taskwarrior, flags.dueBefore, "dueBefore")) : undefined;
  const dueAfterEpoch = flags.dueAfter ? parseTaskDate(resolveCalc(taskwarrior, flags.dueAfter, "dueAfter")) : undefined;
  const scheduledBeforeEpoch = flags.scheduledBefore ? parseTaskDate(resolveCalc(taskwarrior, flags.scheduledBefore, "scheduledBefore")) : undefined;
  const scheduledAfterEpoch = flags.scheduledAfter ? parseTaskDate(resolveCalc(taskwarrior, flags.scheduledAfter, "scheduledAfter")) : undefined;
  const waitBeforeEpoch = flags.waitBefore ? parseTaskDate(resolveCalc(taskwarrior, flags.waitBefore, "waitBefore")) : undefined;
  const waitAfterEpoch = flags.waitAfter ? parseTaskDate(resolveCalc(taskwarrior, flags.waitAfter, "waitAfter")) : undefined;
  const normalizedText = flags.text?.trim().toLowerCase();
  const requiredTags = new Set(stringArray(flags.tag));
  const anyTags = new Set(stringArray(flags.anyTag));
  const uuids = new Set(normalizeUuidList(flags.uuid));
  const statuses = new Set(defaultListStatuses(flags.status));
  return tasks.filter((task) => {
    if (uuids.size > 0 && (!task.uuid || !uuids.has(task.uuid))) {
      return false;
    }
    if (!statuses.has(task.status ?? "pending")) {
      return false;
    }
    if (flags.project && task.project !== flags.project) {
      return false;
    }
    if (flags.projectPrefix && !(task.project ?? "").startsWith(flags.projectPrefix)) {
      return false;
    }
    if (flags.priority === "none") {
      if (task.priority !== undefined) {
        return false;
      }
    } else if (flags.priority && task.priority !== flags.priority) {
      return false;
    }
    const tags = new Set(getTags(task));
    for (const tag of requiredTags) {
      if (!tags.has(tag)) {
        return false;
      }
    }
    if (anyTags.size > 0 && ![...anyTags].some((tag) => tags.has(tag))) {
      return false;
    }
    if (normalizedText) {
      const haystack = [task.description ?? "", ...getAnnotations(task).map((annotation) => annotation.description)].join(`
`).toLowerCase();
      if (!haystack.includes(normalizedText)) {
        return false;
      }
    }
    const dueEpoch = parseTaskDate(task.due);
    if (dueBeforeEpoch !== undefined && (dueEpoch === undefined || dueEpoch >= dueBeforeEpoch)) {
      return false;
    }
    if (dueAfterEpoch !== undefined && (dueEpoch === undefined || dueEpoch <= dueAfterEpoch)) {
      return false;
    }
    const scheduledEpoch = parseTaskDate(task.scheduled);
    if (scheduledBeforeEpoch !== undefined && (scheduledEpoch === undefined || scheduledEpoch >= scheduledBeforeEpoch)) {
      return false;
    }
    if (scheduledAfterEpoch !== undefined && (scheduledEpoch === undefined || scheduledEpoch <= scheduledAfterEpoch)) {
      return false;
    }
    const waitEpoch = parseTaskDate(task.wait);
    if (waitBeforeEpoch !== undefined && (waitEpoch === undefined || waitEpoch >= waitBeforeEpoch)) {
      return false;
    }
    if (waitAfterEpoch !== undefined && (waitEpoch === undefined || waitEpoch <= waitAfterEpoch)) {
      return false;
    }
    if (flags.blocked && !isBlocked(task, taskIndex)) {
      return false;
    }
    if (flags.blocking && !isBlocking(task, tasks)) {
      return false;
    }
    if (flags.active && !isActive(task)) {
      return false;
    }
    if (flags.ready && !isReady(task, taskIndex, nowEpoch)) {
      return false;
    }
    if (flags.overdue && !isOverdue(task, nowEpoch)) {
      return false;
    }
    return true;
  });
}
function dedupeStrings(values) {
  return [...new Set(values)];
}
function ensureNoConflict(active, conflicting, message, details) {
  if (active && conflicting) {
    throw new CliError("CONFLICTING_FLAGS", message, EXIT_CODE.validation, details);
  }
}
function createAnnotation(description) {
  return {
    entry: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    description
  };
}
function buildSchemaPayload(udas) {
  return {
    ok: true,
    cli: {
      name: COMMAND_NAME,
      output: {
        success: "single JSON object on stdout",
        error: "single JSON object on stderr"
      },
      identifiers: {
        mutationKey: "uuid"
      },
      statuses: STATUS_VALUES,
      defaultListStatuses: OPEN_STATUS_VALUES,
      priorities: PRIORITY_VALUES,
      mutableScalarFields: MUTABLE_SCALAR_FIELDS,
      commands: {
        schema: {},
        doctor: {},
        list: {
          filters: [
            "uuid",
            "status",
            "project",
            "projectPrefix",
            "priority",
            "tag",
            "anyTag",
            "text",
            "dueBefore",
            "dueAfter",
            "scheduledBefore",
            "scheduledAfter",
            "waitBefore",
            "waitAfter",
            "blocked",
            "blocking",
            "active",
            "ready",
            "overdue",
            "limit",
            "sort",
            "desc"
          ]
        },
        get: {
          required: ["uuid"]
        },
        create: {
          required: ["description"],
          optional: ["project", "priority", "due", "wait", "scheduled", "until", "recur", "tag", "dependsOn", "annotation", "uda"]
        },
        update: {
          required: ["uuid"],
          supports: [
            "scalar field set/clear",
            "tag add/remove/set/clear",
            "dependency add/remove/set/clear",
            "annotation add/remove",
            "uda set/clear"
          ]
        },
        complete: { required: ["uuid"] },
        reopen: { required: ["uuid"] },
        start: { required: ["uuid"] },
        stop: { required: ["uuid"] },
        delete: { required: ["uuid"] },
        projects: {},
        tags: {},
        stats: {}
      },
      configuredUdas: udas
    }
  };
}
var schemaCommand = buildCommand({
  func: () => {
    let udas = [];
    try {
      const { taskwarrior } = requireTaskwarrior();
      udas = loadUdaDefinitions(taskwarrior);
    } catch {
      udas = [];
    }
    writeJson(buildSchemaPayload(udas));
  },
  parameters: {},
  docs: {
    brief: "Emit machine-readable CLI schema"
  }
});
var doctorCommand = buildCommand({
  func: () => {
    try {
      const version = ensureTaskBinary();
      const taskwarrior = createTaskwarrior();
      const udas = loadUdaDefinitions(taskwarrior);
      writeJson({
        ok: true,
        healthy: true,
        doctor: {
          taskBinaryAvailable: true,
          taskVersion: version,
          taskwarriorLibAvailable: true,
          configuredUdas: udas,
          warnings: []
        }
      });
    } catch (error) {
      const cliError = toCliError(error, "DOCTOR_FAILED", EXIT_CODE.environment);
      writeJson({
        ok: true,
        healthy: false,
        doctor: {
          taskBinaryAvailable: false,
          taskVersion: null,
          taskwarriorLibAvailable: true,
          configuredUdas: [],
          warnings: [errorPayload(cliError).error]
        }
      });
    }
  },
  parameters: {},
  docs: {
    brief: "Check Taskwarrior availability and discovered capabilities"
  }
});
var listCommand = buildCommand({
  func: (flags) => {
    const { taskwarrior } = requireTaskwarrior();
    const tasks = loadTasks(taskwarrior);
    const filtered = applyListFilters(tasks, taskwarrior, flags);
    const sorted = sortTasks(filtered, flags.sort, flags.desc);
    const limited = flags.limit ? sorted.slice(0, flags.limit) : sorted;
    writeJson({
      ok: true,
      count: limited.length,
      tasks: serializeTasks(limited)
    });
  },
  parameters: {
    flags: {
      uuid: {
        brief: "Filter by UUID",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true
      },
      status: {
        brief: "Filter by status",
        kind: "enum",
        values: STATUS_VALUES,
        optional: true,
        variadic: true
      },
      project: {
        brief: "Filter by exact project",
        kind: "parsed",
        parse: String,
        optional: true
      },
      projectPrefix: {
        brief: "Filter by project prefix",
        kind: "parsed",
        parse: String,
        optional: true
      },
      priority: {
        brief: "Filter by priority",
        kind: "enum",
        values: PRIORITY_FILTER_VALUES,
        optional: true
      },
      tag: {
        brief: "Require all listed tags",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true
      },
      anyTag: {
        brief: "Require any listed tag",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true
      },
      text: {
        brief: "Search description and annotations",
        kind: "parsed",
        parse: String,
        optional: true
      },
      dueBefore: {
        brief: "Filter due before expression",
        kind: "parsed",
        parse: String,
        optional: true
      },
      dueAfter: {
        brief: "Filter due after expression",
        kind: "parsed",
        parse: String,
        optional: true
      },
      scheduledBefore: {
        brief: "Filter scheduled before expression",
        kind: "parsed",
        parse: String,
        optional: true
      },
      scheduledAfter: {
        brief: "Filter scheduled after expression",
        kind: "parsed",
        parse: String,
        optional: true
      },
      waitBefore: {
        brief: "Filter wait before expression",
        kind: "parsed",
        parse: String,
        optional: true
      },
      waitAfter: {
        brief: "Filter wait after expression",
        kind: "parsed",
        parse: String,
        optional: true
      },
      blocked: {
        brief: "Only blocked tasks",
        kind: "boolean",
        default: false,
        withNegated: false
      },
      blocking: {
        brief: "Only blocking tasks",
        kind: "boolean",
        default: false,
        withNegated: false
      },
      active: {
        brief: "Only active tasks",
        kind: "boolean",
        default: false,
        withNegated: false
      },
      ready: {
        brief: "Only ready tasks",
        kind: "boolean",
        default: false,
        withNegated: false
      },
      overdue: {
        brief: "Only overdue tasks",
        kind: "boolean",
        default: false,
        withNegated: false
      },
      limit: {
        brief: "Limit result count",
        kind: "parsed",
        parse: positiveIntegerParser,
        optional: true
      },
      sort: {
        brief: "Sort field",
        kind: "enum",
        values: SORT_VALUES,
        optional: true
      },
      desc: {
        brief: "Reverse sort order",
        kind: "boolean",
        default: false,
        withNegated: false
      }
    }
  },
  docs: {
    brief: "List tasks with structured filters"
  }
});
var getCommand = buildCommand({
  func: (flags) => {
    const requested = normalizeUuidList(flags.uuid);
    const { taskwarrior } = requireTaskwarrior();
    const tasks = loadTasks(taskwarrior);
    const taskIndex = buildTaskIndex(tasks);
    const found = requested.map((uuid) => taskIndex.get(uuid)).filter((task) => Boolean(task));
    const missing = requested.filter((uuid) => !taskIndex.has(uuid));
    writeJson({
      ok: true,
      count: found.length,
      tasks: serializeTasks(found),
      missing
    });
  },
  parameters: {
    flags: {
      uuid: {
        brief: "UUID to fetch",
        kind: "parsed",
        parse: String,
        variadic: true
      }
    }
  },
  docs: {
    brief: "Fetch tasks by UUID"
  }
});
var createCommand = buildCommand({
  func: (flags) => {
    if (flags.recur && !flags.due) {
      throw new CliError("INVALID_ARGUMENT", "Recurring tasks require --due", EXIT_CODE.validation);
    }
    const { taskwarrior } = requireTaskwarrior();
    const udas = loadUdaDefinitions(taskwarrior);
    const uuid = randomUUID();
    const task = {
      uuid,
      description: flags.description,
      ...flags.project ? { project: flags.project } : {},
      ...flags.priority ? { priority: flags.priority } : {},
      ...flags.due ? { due: flags.due } : {},
      ...flags.wait ? { wait: flags.wait } : {},
      ...flags.scheduled ? { scheduled: flags.scheduled } : {},
      ...flags.until ? { until: flags.until } : {},
      ...flags.recur ? { recur: flags.recur } : {}
    };
    const tags = dedupeStrings(stringArray(flags.tag));
    if (tags.length > 0) {
      task.tags = tags;
    }
    const dependencies = normalizeUuidList(flags.dependsOn);
    if (dependencies.length > 0) {
      task.depends = dependencies;
    }
    const annotations = stringArray(flags.annotation).map(createAnnotation);
    if (annotations.length > 0) {
      task.annotations = annotations;
    }
    Object.assign(task, parseUdaAssignments(flags.uda, udas));
    taskwarrior.update([task]);
    const tasks = loadTasks(taskwarrior);
    const created = requireTaskByUuid(tasks, normalizeUuid(uuid));
    writeJson({
      ok: true,
      task: serializeTask(created, tasks)
    });
  },
  parameters: {
    flags: {
      description: {
        brief: "Task description",
        kind: "parsed",
        parse: String
      },
      project: {
        brief: "Project",
        kind: "parsed",
        parse: String,
        optional: true
      },
      priority: {
        brief: "Priority",
        kind: "enum",
        values: PRIORITY_VALUES,
        optional: true
      },
      due: {
        brief: "Due date expression",
        kind: "parsed",
        parse: String,
        optional: true
      },
      wait: {
        brief: "Wait date expression",
        kind: "parsed",
        parse: String,
        optional: true
      },
      scheduled: {
        brief: "Scheduled date expression",
        kind: "parsed",
        parse: String,
        optional: true
      },
      until: {
        brief: "Until date expression",
        kind: "parsed",
        parse: String,
        optional: true
      },
      recur: {
        brief: "Recurrence period",
        kind: "parsed",
        parse: String,
        optional: true
      },
      tag: {
        brief: "Tag to add",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true
      },
      dependsOn: {
        brief: "Dependency UUID",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true
      },
      annotation: {
        brief: "Annotation text",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true
      },
      uda: {
        brief: "UDA assignment key=value",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true
      }
    }
  },
  docs: {
    brief: "Create one task"
  }
});
var updateCommand = buildCommand({
  func: (flags) => {
    const uuid = normalizeUuid(flags.uuid);
    const { taskwarrior } = requireTaskwarrior();
    const tasks = loadTasks(taskwarrior);
    const current = requireTaskByUuid(tasks, uuid);
    const udas = loadUdaDefinitions(taskwarrior);
    ensureNoConflict(Boolean(flags.project), flags.clearProject, "Cannot combine --project with --clear-project");
    ensureNoConflict(Boolean(flags.priority), flags.clearPriority, "Cannot combine --priority with --clear-priority");
    ensureNoConflict(Boolean(flags.due), flags.clearDue, "Cannot combine --due with --clear-due");
    ensureNoConflict(Boolean(flags.wait), flags.clearWait, "Cannot combine --wait with --clear-wait");
    ensureNoConflict(Boolean(flags.scheduled), flags.clearScheduled, "Cannot combine --scheduled with --clear-scheduled");
    ensureNoConflict(Boolean(flags.until), flags.clearUntil, "Cannot combine --until with --clear-until");
    ensureNoConflict(Boolean(flags.recur), flags.clearRecur, "Cannot combine --recur with --clear-recur");
    ensureNoConflict(Boolean(flags.setTag?.length), flags.clearTags, "Cannot combine --set-tag with --clear-tags");
    ensureNoConflict(Boolean(flags.setDependency?.length), flags.clearDependencies, "Cannot combine --set-dependency with --clear-dependencies");
    const next = { ...current };
    const updatedFields = [];
    const clearedFields = [];
    if (flags.description !== undefined) {
      next.description = flags.description;
      updatedFields.push("description");
    }
    if (flags.project !== undefined) {
      next.project = flags.project;
      updatedFields.push("project");
    } else if (flags.clearProject) {
      delete next.project;
      clearedFields.push("project");
    }
    if (flags.priority !== undefined) {
      next.priority = flags.priority;
      updatedFields.push("priority");
    } else if (flags.clearPriority) {
      delete next.priority;
      clearedFields.push("priority");
    }
    if (flags.due !== undefined) {
      next.due = flags.due;
      updatedFields.push("due");
    } else if (flags.clearDue) {
      delete next.due;
      clearedFields.push("due");
    }
    if (flags.wait !== undefined) {
      next.wait = flags.wait;
      updatedFields.push("wait");
    } else if (flags.clearWait) {
      delete next.wait;
      clearedFields.push("wait");
    }
    if (flags.scheduled !== undefined) {
      next.scheduled = flags.scheduled;
      updatedFields.push("scheduled");
    } else if (flags.clearScheduled) {
      delete next.scheduled;
      clearedFields.push("scheduled");
    }
    if (flags.until !== undefined) {
      next.until = flags.until;
      updatedFields.push("until");
    } else if (flags.clearUntil) {
      delete next.until;
      clearedFields.push("until");
    }
    if (flags.recur !== undefined) {
      next.recur = flags.recur;
      updatedFields.push("recur");
    } else if (flags.clearRecur) {
      delete next.recur;
      clearedFields.push("recur");
    }
    const tagChanges = {
      added: [],
      removed: []
    };
    const currentTags = getTags(current);
    let nextTags = [...currentTags];
    if (flags.clearTags) {
      nextTags = [];
      tagChanges.removed = currentTags;
    } else if (flags.setTag && flags.setTag.length > 0) {
      const replacement = dedupeStrings(stringArray(flags.setTag));
      tagChanges.added = replacement.filter((tag) => !currentTags.includes(tag));
      tagChanges.removed = currentTags.filter((tag) => !replacement.includes(tag));
      nextTags = replacement;
    } else {
      const additions = dedupeStrings(stringArray(flags.addTag));
      const removals = dedupeStrings(stringArray(flags.removeTag));
      tagChanges.added = additions.filter((tag) => !currentTags.includes(tag));
      tagChanges.removed = removals.filter((tag) => currentTags.includes(tag));
      nextTags = currentTags.filter((tag) => !removals.includes(tag));
      nextTags.push(...tagChanges.added);
      nextTags = dedupeStrings(nextTags);
    }
    if (nextTags.length > 0) {
      next.tags = nextTags;
    } else {
      delete next.tags;
    }
    const dependencyChanges = {
      added: [],
      removed: []
    };
    const currentDependencies = getDepends(current);
    let nextDependencies = [...currentDependencies];
    if (flags.clearDependencies) {
      nextDependencies = [];
      dependencyChanges.removed = currentDependencies;
    } else if (flags.setDependency && flags.setDependency.length > 0) {
      const replacement = normalizeUuidList(flags.setDependency);
      dependencyChanges.added = replacement.filter((dependency) => !currentDependencies.includes(dependency));
      dependencyChanges.removed = currentDependencies.filter((dependency) => !replacement.includes(dependency));
      nextDependencies = replacement;
    } else {
      const additions = normalizeUuidList(flags.addDependency);
      const removals = normalizeUuidList(flags.removeDependency);
      dependencyChanges.added = additions.filter((dependency) => !currentDependencies.includes(dependency));
      dependencyChanges.removed = removals.filter((dependency) => currentDependencies.includes(dependency));
      nextDependencies = currentDependencies.filter((dependency) => !removals.includes(dependency));
      nextDependencies.push(...dependencyChanges.added);
      nextDependencies = dedupeStrings(nextDependencies);
    }
    if (nextDependencies.includes(uuid)) {
      throw new CliError("INVALID_DEPENDENCY", "Task cannot depend on itself", EXIT_CODE.validation, { uuid });
    }
    if (nextDependencies.length > 0) {
      next.depends = nextDependencies;
    } else {
      delete next.depends;
    }
    const annotations = [...getAnnotations(current)];
    const removeEntries = new Set(stringArray(flags.removeAnnotationEntry));
    const removeIndexes = new Set(flags.removeAnnotationIndex ?? []);
    const nextAnnotations = annotations.filter((annotation, index) => {
      if (removeEntries.has(annotation.entry)) {
        return false;
      }
      if (removeIndexes.has(index)) {
        return false;
      }
      return true;
    });
    const addedAnnotations = stringArray(flags.addAnnotation).map(createAnnotation);
    nextAnnotations.push(...addedAnnotations);
    if (nextAnnotations.length > 0) {
      next.annotations = nextAnnotations;
    } else {
      delete next.annotations;
    }
    const udaAssignments = parseUdaAssignments(flags.uda, udas);
    const clearUdas = validateClearUdas(flags.clearUda, udas);
    for (const [key, value] of Object.entries(udaAssignments)) {
      next[key] = value;
    }
    for (const key of clearUdas) {
      delete next[key];
    }
    const hasChanges = updatedFields.length > 0 || clearedFields.length > 0 || tagChanges.added.length > 0 || tagChanges.removed.length > 0 || dependencyChanges.added.length > 0 || dependencyChanges.removed.length > 0 || addedAnnotations.length > 0 || removeEntries.size > 0 || removeIndexes.size > 0 || Object.keys(udaAssignments).length > 0 || clearUdas.length > 0;
    if (!hasChanges) {
      throw new CliError("NO_CHANGES_REQUESTED", "No update changes were requested", EXIT_CODE.validation);
    }
    taskwarrior.update([next]);
    const refreshedTasks = loadTasks(taskwarrior);
    const refreshed = requireTaskByUuid(refreshedTasks, uuid);
    writeJson({
      ok: true,
      task: serializeTask(refreshed, refreshedTasks),
      changes: {
        updatedFields,
        clearedFields,
        tags: {
          added: tagChanges.added,
          removed: tagChanges.removed,
          after: getTags(refreshed)
        },
        dependencies: {
          added: dependencyChanges.added,
          removed: dependencyChanges.removed,
          after: getDepends(refreshed)
        },
        annotations: {
          added: addedAnnotations.map((annotation) => annotation.description),
          removedEntries: [...removeEntries],
          removedIndexes: [...removeIndexes],
          afterCount: getAnnotations(refreshed).length
        },
        udas: {
          set: Object.keys(udaAssignments),
          cleared: clearUdas
        }
      }
    });
  },
  parameters: {
    flags: {
      uuid: {
        brief: "Task UUID",
        kind: "parsed",
        parse: String
      },
      description: {
        brief: "New description",
        kind: "parsed",
        parse: String,
        optional: true
      },
      project: {
        brief: "Set project",
        kind: "parsed",
        parse: String,
        optional: true
      },
      clearProject: {
        brief: "Clear project",
        kind: "boolean",
        default: false,
        withNegated: false
      },
      priority: {
        brief: "Set priority",
        kind: "enum",
        values: PRIORITY_VALUES,
        optional: true
      },
      clearPriority: {
        brief: "Clear priority",
        kind: "boolean",
        default: false,
        withNegated: false
      },
      due: {
        brief: "Set due date",
        kind: "parsed",
        parse: String,
        optional: true
      },
      clearDue: {
        brief: "Clear due date",
        kind: "boolean",
        default: false,
        withNegated: false
      },
      wait: {
        brief: "Set wait date",
        kind: "parsed",
        parse: String,
        optional: true
      },
      clearWait: {
        brief: "Clear wait date",
        kind: "boolean",
        default: false,
        withNegated: false
      },
      scheduled: {
        brief: "Set scheduled date",
        kind: "parsed",
        parse: String,
        optional: true
      },
      clearScheduled: {
        brief: "Clear scheduled date",
        kind: "boolean",
        default: false,
        withNegated: false
      },
      until: {
        brief: "Set until date",
        kind: "parsed",
        parse: String,
        optional: true
      },
      clearUntil: {
        brief: "Clear until date",
        kind: "boolean",
        default: false,
        withNegated: false
      },
      recur: {
        brief: "Set recurrence period",
        kind: "parsed",
        parse: String,
        optional: true
      },
      clearRecur: {
        brief: "Clear recurrence period",
        kind: "boolean",
        default: false,
        withNegated: false
      },
      addTag: {
        brief: "Add tag",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true
      },
      removeTag: {
        brief: "Remove tag",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true
      },
      setTag: {
        brief: "Replace all tags",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true
      },
      clearTags: {
        brief: "Remove all tags",
        kind: "boolean",
        default: false,
        withNegated: false
      },
      addDependency: {
        brief: "Add dependency UUID",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true
      },
      removeDependency: {
        brief: "Remove dependency UUID",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true
      },
      setDependency: {
        brief: "Replace all dependency UUIDs",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true
      },
      clearDependencies: {
        brief: "Remove all dependencies",
        kind: "boolean",
        default: false,
        withNegated: false
      },
      addAnnotation: {
        brief: "Add annotation",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true
      },
      removeAnnotationEntry: {
        brief: "Remove annotation by entry timestamp",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true
      },
      removeAnnotationIndex: {
        brief: "Remove annotation by zero-based index",
        kind: "parsed",
        parse: nonNegativeIntegerParser,
        optional: true,
        variadic: true
      },
      uda: {
        brief: "Set UDA with key=value",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true
      },
      clearUda: {
        brief: "Clear configured UDA",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true
      }
    }
  },
  docs: {
    brief: "Update one task by UUID"
  }
});
var completeCommand = buildCommand({
  func: (flags) => {
    const uuid = normalizeUuid(flags.uuid);
    const { taskwarrior } = requireTaskwarrior();
    const tasks = loadTasks(taskwarrior);
    const current = requireTaskByUuid(tasks, uuid);
    if (current.status === "recurring") {
      throw new CliError("INVALID_STATUS_TRANSITION", "Cannot complete a recurring template task", EXIT_CODE.validation, {
        uuid
      });
    }
    const next = { ...current, status: "completed" };
    if (flags.at) {
      next.end = resolveCalc(taskwarrior, flags.at, "completion time");
    } else {
      delete next.end;
    }
    taskwarrior.update([next]);
    const refreshedTasks = loadTasks(taskwarrior);
    const refreshed = requireTaskByUuid(refreshedTasks, uuid);
    writeJson({ ok: true, task: serializeTask(refreshed, refreshedTasks) });
  },
  parameters: {
    flags: {
      uuid: {
        brief: "Task UUID",
        kind: "parsed",
        parse: String
      },
      at: {
        brief: "Completion time expression",
        kind: "parsed",
        parse: String,
        optional: true
      }
    }
  },
  docs: {
    brief: "Mark a task completed"
  }
});
var reopenCommand = buildCommand({
  func: (flags) => {
    const uuid = normalizeUuid(flags.uuid);
    const { taskwarrior } = requireTaskwarrior();
    const tasks = loadTasks(taskwarrior);
    const current = requireTaskByUuid(tasks, uuid);
    if (current.status !== "completed" && current.status !== "deleted") {
      throw new CliError("INVALID_STATUS_TRANSITION", "Only completed or deleted tasks can be reopened", EXIT_CODE.validation, {
        uuid,
        status: current.status
      });
    }
    const next = { ...current, status: "pending" };
    delete next.end;
    taskwarrior.update([next]);
    const refreshedTasks = loadTasks(taskwarrior);
    const refreshed = requireTaskByUuid(refreshedTasks, uuid);
    writeJson({ ok: true, task: serializeTask(refreshed, refreshedTasks) });
  },
  parameters: {
    flags: {
      uuid: {
        brief: "Task UUID",
        kind: "parsed",
        parse: String
      }
    }
  },
  docs: {
    brief: "Reopen a completed or deleted task"
  }
});
var startCommand = buildCommand({
  func: (flags) => {
    const uuid = normalizeUuid(flags.uuid);
    const { taskwarrior } = requireTaskwarrior();
    const tasks = loadTasks(taskwarrior);
    const current = requireTaskByUuid(tasks, uuid);
    if (isClosed(current) || current.status === "recurring") {
      throw new CliError("INVALID_STATUS_TRANSITION", "Only pending or waiting tasks can be started", EXIT_CODE.validation, {
        uuid,
        status: current.status
      });
    }
    const next = { ...current, start: flags.at ?? "now" };
    taskwarrior.update([next]);
    const refreshedTasks = loadTasks(taskwarrior);
    const refreshed = requireTaskByUuid(refreshedTasks, uuid);
    writeJson({ ok: true, task: serializeTask(refreshed, refreshedTasks) });
  },
  parameters: {
    flags: {
      uuid: {
        brief: "Task UUID",
        kind: "parsed",
        parse: String
      },
      at: {
        brief: "Start time expression",
        kind: "parsed",
        parse: String,
        optional: true
      }
    }
  },
  docs: {
    brief: "Mark a task started"
  }
});
var stopCommand = buildCommand({
  func: (flags) => {
    const uuid = normalizeUuid(flags.uuid);
    const { taskwarrior } = requireTaskwarrior();
    const tasks = loadTasks(taskwarrior);
    const current = requireTaskByUuid(tasks, uuid);
    if (current.status === "recurring") {
      throw new CliError("INVALID_STATUS_TRANSITION", "Recurring template tasks cannot be stopped", EXIT_CODE.validation, {
        uuid
      });
    }
    const next = { ...current };
    delete next.start;
    taskwarrior.update([next]);
    const refreshedTasks = loadTasks(taskwarrior);
    const refreshed = requireTaskByUuid(refreshedTasks, uuid);
    writeJson({ ok: true, task: serializeTask(refreshed, refreshedTasks) });
  },
  parameters: {
    flags: {
      uuid: {
        brief: "Task UUID",
        kind: "parsed",
        parse: String
      }
    }
  },
  docs: {
    brief: "Clear task start time"
  }
});
var deleteCommand = buildCommand({
  func: (flags) => {
    const uuid = normalizeUuid(flags.uuid);
    const { taskwarrior } = requireTaskwarrior();
    const tasks = loadTasks(taskwarrior);
    const current = requireTaskByUuid(tasks, uuid);
    if (current.status === "deleted") {
      writeJson({
        ok: true,
        deleted: {
          uuid,
          alreadyDeleted: true
        }
      });
      return;
    }
    taskwarrior.del([{ uuid }]);
    writeJson({
      ok: true,
      deleted: {
        uuid,
        description: current.description ?? null,
        statusBefore: current.status ?? "pending"
      }
    });
  },
  parameters: {
    flags: {
      uuid: {
        brief: "Task UUID",
        kind: "parsed",
        parse: String
      }
    }
  },
  docs: {
    brief: "Soft-delete one task"
  }
});
function applyAggregateBaseFilters(tasks, flags) {
  const statuses = new Set(defaultListStatuses(flags.status));
  const requiredTags = new Set(stringArray(flags.tag));
  return tasks.filter((task) => {
    if (!statuses.has(task.status ?? "pending")) {
      return false;
    }
    if (flags.project && task.project !== flags.project) {
      return false;
    }
    const tags = new Set(getTags(task));
    for (const tag of requiredTags) {
      if (!tags.has(tag)) {
        return false;
      }
    }
    return true;
  });
}
var projectsCommand = buildCommand({
  func: (flags) => {
    const { taskwarrior } = requireTaskwarrior();
    const tasks = applyAggregateBaseFilters(loadTasks(taskwarrior), flags);
    const counts = new Map;
    for (const task of tasks) {
      if (!task.project) {
        continue;
      }
      counts.set(task.project, (counts.get(task.project) ?? 0) + 1);
    }
    const projects = [...counts.entries()].map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
    const limited = flags.limit ? projects.slice(0, flags.limit) : projects;
    writeJson({ ok: true, count: limited.length, projects: limited });
  },
  parameters: {
    flags: {
      status: {
        brief: "Filter by status",
        kind: "enum",
        values: STATUS_VALUES,
        optional: true,
        variadic: true
      },
      limit: {
        brief: "Limit result count",
        kind: "parsed",
        parse: positiveIntegerParser,
        optional: true
      }
    }
  },
  docs: {
    brief: "Aggregate projects and counts"
  }
});
var tagsCommand = buildCommand({
  func: (flags) => {
    const { taskwarrior } = requireTaskwarrior();
    const tasks = applyAggregateBaseFilters(loadTasks(taskwarrior), flags);
    const counts = new Map;
    for (const task of tasks) {
      for (const tag of getTags(task)) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    const tags = [...counts.entries()].map(([name, count]) => ({ name, count })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
    const limited = flags.limit ? tags.slice(0, flags.limit) : tags;
    writeJson({ ok: true, count: limited.length, tags: limited });
  },
  parameters: {
    flags: {
      status: {
        brief: "Filter by status",
        kind: "enum",
        values: STATUS_VALUES,
        optional: true,
        variadic: true
      },
      project: {
        brief: "Filter by exact project",
        kind: "parsed",
        parse: String,
        optional: true
      },
      limit: {
        brief: "Limit result count",
        kind: "parsed",
        parse: positiveIntegerParser,
        optional: true
      }
    }
  },
  docs: {
    brief: "Aggregate tags and counts"
  }
});
var statsCommand = buildCommand({
  func: (flags) => {
    const { taskwarrior } = requireTaskwarrior();
    const allTasks = loadTasks(taskwarrior);
    const tasks = applyAggregateBaseFilters(allTasks, flags);
    const taskIndex = buildTaskIndex(allTasks);
    const nowEpoch = getNowEpoch();
    const byStatus = {};
    const byPriority = {};
    const byProject = {};
    for (const task of tasks) {
      const status = task.status ?? "pending";
      byStatus[status] = (byStatus[status] ?? 0) + 1;
      const priority = task.priority ?? "none";
      byPriority[priority] = (byPriority[priority] ?? 0) + 1;
      const project = task.project ?? "none";
      byProject[project] = (byProject[project] ?? 0) + 1;
    }
    writeJson({
      ok: true,
      stats: {
        total: tasks.length,
        byStatus,
        byPriority,
        byProject,
        active: tasks.filter((task) => isActive(task)).length,
        blocked: tasks.filter((task) => isBlocked(task, taskIndex)).length,
        blocking: tasks.filter((task) => isBlocking(task, allTasks)).length,
        ready: tasks.filter((task) => isReady(task, taskIndex, nowEpoch)).length,
        overdue: tasks.filter((task) => isOverdue(task, nowEpoch)).length,
        waiting: tasks.filter((task) => isWaiting(task, nowEpoch)).length
      }
    });
  },
  parameters: {
    flags: {
      status: {
        brief: "Filter by status",
        kind: "enum",
        values: STATUS_VALUES,
        optional: true,
        variadic: true
      },
      project: {
        brief: "Filter by exact project",
        kind: "parsed",
        parse: String,
        optional: true
      },
      tag: {
        brief: "Require all listed tags",
        kind: "parsed",
        parse: String,
        optional: true,
        variadic: true
      }
    }
  },
  docs: {
    brief: "Aggregate task counts and computed states"
  }
});
var root = buildRouteMap({
  routes: {
    schema: schemaCommand,
    doctor: doctorCommand,
    list: listCommand,
    get: getCommand,
    create: createCommand,
    update: updateCommand,
    complete: completeCommand,
    reopen: reopenCommand,
    start: startCommand,
    stop: stopCommand,
    delete: deleteCommand,
    projects: projectsCommand,
    tags: tagsCommand,
    stats: statsCommand
  },
  docs: {
    brief: "Agent-only Taskwarrior CLI"
  }
});
var app = buildApplication(root, {
  name: COMMAND_NAME,
  scanner: {
    caseStyle: "allow-kebab-for-camel",
    allowArgumentEscapeSequence: false
  },
  documentation: {
    caseStyle: "convert-camel-to-kebab",
    disableAnsiColor: true,
    onlyRequiredInUsageLine: false,
    alwaysShowHelpAllFlag: false,
    useAliasInUsageLine: false
  },
  localization: {
    defaultLocale: "en",
    loadText: () => appText
  },
  determineExitCode
});
var rawExitCode = await runApplication(app, process.argv.slice(2), { process });
process.exitCode = normalizeExitCode(rawExitCode);
