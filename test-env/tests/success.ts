import { Test } from '../debug';

export default {
    name: 'This should succeed',
    expect: true,
    test: async() => {
        return true;
    }
} as Test;