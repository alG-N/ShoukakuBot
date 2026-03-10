import { WikipediaHandler } from './WikipediaHandler.js';

export { WikipediaHandler };
export { type WikiArticle as WikipediaArticle, type WikiSearchResult, type OnThisDayEvent, type OnThisDayDate } from '../../../types/api/models/wikipedia.js';

const wikipediaHandler = new WikipediaHandler();
export { wikipediaHandler };
export default wikipediaHandler;
