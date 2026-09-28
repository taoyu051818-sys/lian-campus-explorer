const target = new URL("./world.html", location.href);
target.search = location.search;
if (!target.searchParams.has("place"))
  target.searchParams.set("place", "uestc");
location.replace(target);
export {};
