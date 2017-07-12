//TODO: UrlConverter seems bit to slow ... try to replace him with something smarter ... just figure out rules ...

var Url = require('url'),
  Ini = require('ini'),
  Path = require('path'),
  ChildProcess = require('child_process');

function createGitHelpers (lib) {
  'use strict';
  var Q = lib.q,
    Node = require('allex_nodehelpersserverruntimelib')(lib),
    Fs = Node.Fs;

  function isClone (path) {
    return Fs.existsSync(Path.join(path,'.git'));
  }

  function prepareRemoteUrl (url) {
    if (!url) throw new Error('No url');
    return 'git ls-remote '+url;
  }
  function remoteExistsSync(url){
    return ChildProcess.execSync(prepareRemoteUrl(url));
  }

  function remoteExists (url) {
    var d = Q.defer();
    Node.executeCommand(prepareRemoteUrl(url), d);
    return d.promise;
  }

  function prepareCloneCommand(remote_path, path){
    if (!remote_path) throw new Error ('No remote_path provided');
    if (Fs.existsSync(path)) throw new Error('Path '+path+' exists, unable to move on ...');
    var command = 'git clone '+remote_path;
    if (path) command += (' '+path);
    return command;
  }
  function clone (remote_path, path, d) {
    if (!d) d = Q.defer();
    Node.executeCommand(prepareCloneCommand(remote_path, path), d);
    return d.promise;
  }

  function cloneSync (remote_path, path) {
    return ChildProcess.execSync(prepareCloneCommand(remote_path, path));
  }
  //DONE with redesigned ...



  function gotGitIgnoredData (d, list, resp) {
    d.resolve(resp);
  };

  function checkIfIgnored(list) {
    var d = Q.defer();
    var l = ('string' === typeof(list)) ? list : list.join(' ');
    Node.executeCommand('git check-ignore '+l)
    .then (gotGitIgnoredData.bind(null, d, list), gotGitIgnoredData.bind(null, d, list, null));
    return d.promise;
  }

  function appendGitIgnore (rec, gitignorepath) {
    ///todo: never tested ...
    if (!gitignorepath) {
      gitignorepath = Path.join(process.cwd(), '.gitignore');
    }else if (Path.basename(gitignorepath) === '.gitignore'){
      gitignorepath = Path.join(gitignorepath, '.gitignore');
    }
    var content = '';
    if (Fs.fileExists(gitignorepath)){
      content = Fs.readFileSync(gitignorepath, {encoding:'utf8'});
    }
    content+=("\n"+rec);
    Fs.writeFileSync(gitignorepath, content);
  }

  function isSubmodule (path, cwd) {
    if (!cwd) cwd = process.cwd();
    var gitmodules = Path.join(cwd, '.gitmodules');
    if (!Fs.fileExists(gitmodules)) return false;
    var content = Ini.parse(Fs.readFileSync(gitmodules, 'utf8'));
    for (var i in content) {
      if (content[i] && content[i].path === path) return true;
    }
    return false;
  }

  function addSubmodule (remote_path, local_path, d) {
    if (!d) d = Q.defer();
    Node.executeCommand('git submodule add '+remote_path+' '+local_path+' && allex-git-init-subrepo '+Path.join(process.cwd(), local_path), d);
    return d.promise;
  };

  function initializeSubmodules () {
    var d = Q.defer();
    Node.executeCommand('allex-git-init-subrepos '+process.cwd())
    .then(d.resolve.bind(d), d.reject.bind(d));
    return d.promise;
  }

  function updateOneSubmodule (path, d) {
    if (!d) d = Q.defer();
    Node.executeCommand('allex-git-init-subrepo '+Path.resolve(process.cwd(), path), d);
    return d.promise;
  }

  function getLastCommitID (path) {
    ////OVO IZ NEKOG RAZLOGA NE RADI ...
    return Node.executeCommandSync('git rev-parse HEAD', {cwd: path||process.cwd()});
  }

  function setBranch(branch, cwd, d) {
    if (!branch) throw Error ('Unable to clone to no branch:'+branch);
    if (!d) d = Q.defer();
    Node.executeCommand('git checkout '+branch, d, {cwd: cwd});
    return d.promise;
  }

  function getConfigPath (dir) {
    var p = Path.resolve(process.cwd(), Path.join(dir, '.git'));
    if (Fs.dirExists(p)) return p;
    var rel = (Fs.readFileSync(p, 'utf8').split('\n')[0]).trim();
    return Path.resolve(process.cwd(), dir, rel);
  }

  function getHooksPath (dir) {
    var dir_abs = Path.resolve(process.cwd(), dir),
      git_info = Path.join(dir_abs, '.git'),
      ret = null;

    ret = Path.resolve(getConfigPath(dir), 'hooks');
    if (!Fs.dirExists(ret)) {
      throw Error('Not done as expected');
    }
    return ret;
  }

  function getConfig(dir) {
    var config_path = getConfigPath(dir);
    if (!Fs.dirExists(config_path)) throw Error('Directory '+dir+' does not exist');
    return Ini.parse(Fs.readFileSync(Path.join(config_path, 'config'), 'utf8'));
  }

  function preparePullCommand (path) {
    var ret = 'git pull';
    return path ? 'cd '+path+' && '+ret+' && cd -' : ret;
  }
  function update(path, defer) {
    return Node.executeCommand(preparePullCommand(path), defer);
  }

  function updateSync (path) {
    ChildProcess.execSync(preparePullCommand(path));
  }

  function getRepoName (gitpath) {
    var np, rp, spl;
    if (!lib.isString(gitpath)) {
      return '';
    }
    np = gitpath.replace('git+ssh://');
    rp = np.substring(np.indexOf(':'));
    spl = rp.split('/');
    return spl[spl.length-1].replace(/\.git$/,'');
  }

  function execSync (command, cwd){
    console.log('about to do a command ', command);
    return ChildProcess.execSync(command,{cwd: cwd || 'node_modules'}).toString();
  }

  function isDirClear (dir) {
    if (!Fs.existsSync(Path.join(dir, '.git'))){
      throw new Error('Not a git repo');
    }

    var branch = execSync ('git branch', dir);
    if (!branch || !branch.length) return true; //no branch ... nothing to be done here ... TODO: reconsider this one ...

    var uncommited = execSync('git ls-files --others -m --exclude-standard', dir);
    if (uncommited.length) { throw new Error('Uncommited or not added files detected, cowardly retreating: '+uncommited); }

    var added = execSync('git diff --cached --name-only', dir);
    if (added.length) { throw new Error('Detected some added files for commit, cowardly retreating: '+added); }

    var branch = execSync('git rev-parse --abbrev-ref HEAD', dir).trim();
    var nonpushed = execSync('git log origin/'+branch+'..'+branch, dir);
    if (nonpushed.length) { throw new Error('Commits which are not pushed detected, cowardly retreating: '+nonpushed); }

    return true;
  }

  return {
    isClone : isClone,
    clone: clone,
    cloneSync: cloneSync,
    update: update,
    updateSync: updateSync,
    setBranch: setBranch,
    remoteExists: remoteExists,
    checkIfIgnored : checkIfIgnored,
    appendGitIgnore : appendGitIgnore,
    initializeSubmodules: initializeSubmodules,
    isSubmodule : isSubmodule,
    addSubmodule: addSubmodule,
    getHooksPath : getHooksPath,
    getConfig : getConfig,
    getConfigPath: getConfigPath,
    getLastCommitID: getLastCommitID,
    getRepoName : getRepoName,
    isDirClear : isDirClear
  };
}

module.exports = createGitHelpers;
