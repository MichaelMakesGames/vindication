export interface Headline {
	district: number;
	text: string;
	visibleTo: {
		authority: boolean;
		rebel: boolean;
	};
}

export default Headline;
