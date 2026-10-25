const parsePagination = (query) => {
  const page  = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 100);  // cap abuse
  return { page, limit, skip: (page - 1) * limit };
};

const paginated = async (Model, filter, sort, { page, limit, skip }) => {
  const [total, data] = await Promise.all([
    Model.countDocuments(filter),
    Model.find(filter).sort(sort).skip(skip).limit(limit).lean(),
  ]);
  const totalPages = Math.ceil(total / limit);
  return { data, pagination: { page, limit, total, totalPages: totalPages || 1,
                               hasNextPage: page < totalPages } };
};

module.exports = { parsePagination, paginated };