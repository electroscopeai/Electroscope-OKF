const TOOL_RESULT_KEYS = {
  search_clients: 'clients',
  search_deals: 'deals',
  search_people: 'people',
};

const MAX_PAGE_LIMIT = 25;
const MAX_PAGES = 10_000;

const dedupeById = (items) => Array.from(new Map(
  items
    .filter((item) => item && typeof item === 'object' && typeof item.id === 'string')
    .map((item) => [item.id, item]),
).values());

const asIssuePath = (value) => Array.isArray(value) ? value.map((part) => String(part)) : [];

const isUnsupportedPaginationResult = (result) =>
  result?.isError === true
  && Array.isArray(result?.structuredContent?.issues)
  && result.structuredContent.issues.some((issue) => asIssuePath(issue?.path).includes('page'));

const resolveLimit = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return MAX_PAGE_LIMIT;
  }
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_PAGE_LIMIT);
};

const resolveRows = (toolName, result) => {
  const resultKey = TOOL_RESULT_KEYS[toolName];
  if (!resultKey) {
    throw new Error(`Unsupported search tool: ${toolName}`);
  }
  const rows = result?.structuredContent?.[resultKey];
  return Array.isArray(rows) ? rows : [];
};

const resolveTotal = (rows, result) => {
  const total = result?.structuredContent?.total;
  return typeof total === 'number' && Number.isFinite(total) ? total : rows.length;
};

const resolveHasMore = (rows, result, limit, collectedCount) => {
  const hasMore = result?.structuredContent?.has_more;
  if (typeof hasMore === 'boolean') {
    return hasMore;
  }
  const total = result?.structuredContent?.total;
  if (typeof total === 'number' && Number.isFinite(total)) {
    return collectedCount < total;
  }
  return rows.length === limit;
};

const supportsPaginationMetadata = (result) => {
  const structuredContent = result?.structuredContent;
  if (!structuredContent || typeof structuredContent !== 'object') {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(structuredContent, 'page')
    || Object.prototype.hasOwnProperty.call(structuredContent, 'has_more');
};

export const collectSearchResults = async ({ client, toolName, query = '', scope, limit, extraArguments = {} }) => {
  const pageSize = resolveLimit(limit);
  const collected = [];

  const firstPageResult = await client.callTool(toolName, {
    ...extraArguments,
    scope,
    query,
    limit: pageSize,
    page: 1,
  });

  if (isUnsupportedPaginationResult(firstPageResult)) {
    const fallbackResult = await client.callTool(toolName, {
      ...extraArguments,
      scope,
      query,
      limit: pageSize,
    });
    return dedupeById(resolveRows(toolName, fallbackResult));
  }

  if (!supportsPaginationMetadata(firstPageResult)) {
    return dedupeById(resolveRows(toolName, firstPageResult));
  }

  let currentResult = firstPageResult;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const rows = resolveRows(toolName, currentResult);
    collected.push(...rows);

    const dedupedCount = dedupeById(collected).length;
    const hasMore = resolveHasMore(rows, currentResult, pageSize, dedupedCount);
    if (!hasMore || rows.length === 0) {
      return dedupeById(collected).slice(0, resolveTotal(rows, currentResult));
    }

    currentResult = await client.callTool(toolName, {
      ...extraArguments,
      scope,
      query,
      limit: pageSize,
      page: page + 1,
    });
  }

  throw new Error(`Pagination exceeded ${MAX_PAGES} pages for ${toolName}.`);
};

export const buildDealPeopleById = (people) => {
  const dealPeopleById = new Map();
  for (const person of people) {
    for (const relatedDeal of person.related_deals ?? []) {
      const existing = dealPeopleById.get(relatedDeal.id) ?? [];
      existing.push({
        id: person.id,
        name: person.name,
        deal_role: relatedDeal.deal_role ?? null,
      });
      dealPeopleById.set(relatedDeal.id, dedupeById(existing));
    }
  }
  return dealPeopleById;
};
