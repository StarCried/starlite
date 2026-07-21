import Hexo from "hexo";

const hexo = new Hexo(process.cwd(), { silent: false });
hexo.env.init = true;

try {
  await hexo.init();
  await hexo.call("clean");
  await hexo.call("generate");
} finally {
  await hexo.exit();
}
