/**
 * Helper function to get short name from full path
 * Universal prefix removal for any champion
 * Pattern: ChampionName_Base_ or ChampionName_Skin[Number]_
 */
export const getShortSystemName = (fullPath) => {
    if (!fullPath) return 'Unknown System';

    // Extract the last part of the path (the actual system name)
    const parts = fullPath.split('/');
    let shortName = parts[parts.length - 1];

    // Universal prefix removal for any champion
    // Pattern: ChampionName_Base_ or ChampionName_Skin[Number]_
    const universalPrefixPattern = /^[A-Z][a-z]+_(Base_|Skin\d+_)/;
    const match = shortName.match(universalPrefixPattern);

    if (match) {
        // Remove the matched prefix
        shortName = shortName.substring(match[0].length);
    }

    // If it's still too long, truncate it
    if (shortName.length > 45) {
        return shortName.substring(0, 42) + '...';
    }

    return shortName;
};
