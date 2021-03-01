
import * as git from 'isomorphic-git';
import * as fs from 'fs';
import * as path from 'path';

const protocol = 'https';

const findRootPath = (targetPath: string): string => {
  const absoluteTarget = path.resolve(targetPath);
  const parent = path.dirname(absoluteTarget);
  if (absoluteTarget === parent) {
    throw new Error(`.git was not found`);
  } else if (fs.statSync(absoluteTarget).isFile()) {
    return findRootPath(parent);
  } else {
    const findPath = fs.readdirSync(absoluteTarget)
      .map(f => path.join(absoluteTarget, f))
      .find(f => fs.statSync(f).isDirectory() && f.match(/\/.git$/));
    if (findPath) {
      return path.dirname(findPath);
    }
    return findRootPath(parent);
  }
};

const findObject = async(dir: string, gitPath: string, oid: string): Promise<string | undefined> => {
  const pathList = gitPath.split(path.sep);
  const name = pathList.shift();
  const next = pathList.join(path.sep);
  const tree = await git.readTree({fs, dir, oid});
  if (name === '') {
    return oid;
  }
  const entry = tree.tree.find(entry => entry.path === name);
  if (!entry) {
    return undefined;
  }
  if (name === gitPath) {
    return entry.oid;
  }
  return findObject(dir, next, entry.oid);
}

export const resolve = async(target: string, start?: number, end?: number) => {
  const absoluteTarget = path.resolve(target);
  if (!fs.existsSync(absoluteTarget)) {
    throw new Error(`File was not found: ${target}`);
  }
  const type = fs.statSync(absoluteTarget).isFile() ? 'blob' : 'tree';
  const dir = findRootPath(absoluteTarget);
  const gitPath = path.relative(dir, absoluteTarget);
  const logs = await git.log({fs, dir, depth: 1});
  if (!logs[0]) {
    throw new Error(`Not yet committed`);
  }
  const oid = logs[0].oid;
  const obj = await findObject(dir, gitPath, oid);
  if (!obj) {
    throw new Error(`Not yet committed: ${target}`);
  }
  const githubUrl = await git.getConfig({fs, dir, path: 'remote.origin.url'});
  const githubWebUrl = githubUrl.replace(/^(ssh|https):\/\/(git@)?(.+)\.git$/, '$3');
  const anchor = start ? `#L${start}` + (end ? `-#L${end}` : '') : ''
  return `${protocol}://${path.join(githubWebUrl, type, oid, encodeURI(gitPath))}${anchor}`;
};
