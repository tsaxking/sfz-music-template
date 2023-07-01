
/**
 * Cleans a string to be used as a SQL table name or column name.
 * @param {String} str 
 * @returns {String}
 */
export const cleanseSQL = (str: string): string => {
    return str
    // remove comments
        .replace(/--.*/gi, '')
    // remove all non-alphanumeric characters
        .replace(/[^a-z0-9]/gi, '')
    // remove all leading numbers
        .replace(/^[0-9]*/gi, '')
    // remove all leading dashes
        .replace(/^-*/gi, '')
    // remove all leading spaces
        .replace(/^ */gi, '')
    // remove all trailing spaces
        .replace(/ *$/gi, '');
};