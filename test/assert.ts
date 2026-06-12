// Testing file

/**
 * Compares two objects for deep equality
 * @param actual The actual value to test
 * @param expected The expected value to compare against
 * @param message The message to display if assertion fails
 * @throws Error if objects are not equal
 */
export function assertEqualsObj<T>(actual: T, expected: T, message: string): void {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr !== expectedStr) {
        throw new Error(`${message}\nExpected: ${expectedStr}\nActual: ${actualStr}`);
    }
}

/**
 * Compares two primitive values for equality
 * @param actual The actual value to test
 * @param expected The expected value to compare against
 * @param message The message to display if assertion fails
 * @throws Error if values are not equal
 */
export function assertEquals<T>(actual: T, expected: T, message: string): void {
    if (actual !== expected) {
        throw new Error(`${message}\nExpected: ${expected}\nActual: ${actual}`);
    }
}

/**
 * Tests if a function throws an expected error
 * @param fn The function to test
 * @param expectedError The expected error message or part of it
 * @param message The message to display if assertion fails
 * @throws Error if function doesn't throw or throws unexpected error
 */
export function assertThrows(
    fn: () => void,
    expectedError: string,
    message: string
): void {
    try {
        fn();
        throw new Error(`${message}: Expected to throw "${expectedError}"`);
    } catch (error) {
        if (!(error instanceof Error)) {
            throw new Error(`${message}\nUnexpected error type: ${typeof error}`);
        }

        if (!error.message.includes(expectedError)) {
            throw new Error(
                `${message}\nExpected error: ${expectedError}\nActual error: ${error.message}`
            );
        }
    }
}
