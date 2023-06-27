export type InstitutionObject = {
    id: number;
    name: string;
    
};


export class Institution {
    static async fromId(id: number): Promise<Institution> {
        return new Institution()
    }
}