/**
 * Flint - BIN Property Tree Component (Placeholder)
 */

import React from 'react';

interface BinPropertyTreeProps {
    data: unknown[];
}

export const BinPropertyTree: React.FC<BinPropertyTreeProps> = ({ data }) => {
    return (
        <div className="bin-property-tree">
            <pre>{JSON.stringify(data, null, 2)}</pre>
        </div>
    );
};
