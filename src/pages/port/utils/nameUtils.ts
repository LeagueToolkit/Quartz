/* Get a short display name from a full VFX system path.
   Universal prefix removal: ChampionName_Base_ or ChampionName_Skin[Number]_ */
export const getShortSystemName = (fullPath: string): string => {
    if (!fullPath) return 'Unknown System';

    const parts = fullPath.split('/');
    let shortName = parts[parts.length - 1];

    const universalPrefixPattern = /^[A-Z][a-z]+_(Base_|Skin\d+_)/;
    const match = shortName.match(universalPrefixPattern);

    if (match) {
        shortName = shortName.substring(match[0].length);
    }

    if (shortName.length > 45) {
        return shortName.substring(0, 42) + '...';
    }

    return shortName;
};
