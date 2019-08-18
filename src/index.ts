import {
  Plugin,
  Compiler,
} from 'webpack'
import {
  load,
} from 'cheerio'
import {
  resolve,
  isAbsolute,
} from 'path'
import {
  readFileSync,
  writeFileSync,
  unlink,
} from 'fs'
import chalk from 'chalk'
import {
  transformSync,
} from '@babel/core'
import {
  format,
} from 'prettier'

const PLUGIN_NAME = 'GlobalConfigWebpackPlugin'

interface Options {

  /**
   * html模版名称
   *
   * @type {string}
   * @memberof Options
   * @default index.html
   */
  templateHtmlName: string

  /**
   * 挂载全局配置名称
   *
   * @type {string}
   * @memberof Options
   * @default globalConfig
   */
  globalConfigName: string

  /**
   * 全局配置文件路径
   *
   * @type {string}
   * @memberof Options
   * @default /globalConfig.ts
   */
  globalConfigFilePath: string
}

const initOptions: Options = {
  templateHtmlName: 'index.html',
  globalConfigName: 'globalConfig',
  globalConfigFilePath: '../../globalConfig.ts',
}

class GlobalConfigWebpackPlugin implements Plugin {
  constructor (private options: Options = initOptions) {}
  apply(compiler: Compiler) {
    const {
      templateHtmlName,
      globalConfigName,
      globalConfigFilePath,
    } = this.options
    compiler.hooks.emit.tap(PLUGIN_NAME, async compilation => {
      // 获取配置信息
      try {
        const config = readFileSync(
          isAbsolute(globalConfigFilePath) ? globalConfigFilePath : resolve(__dirname, globalConfigFilePath)
        ).toString()
        const transformConfig = transformSync(config, {
          presets: [
            '@babel/preset-env',
            ['@babel/preset-typescript', {
              allExtensions: true,
            }],
          ],
        })
        if (transformConfig && transformConfig.code) {
          writeFileSync(resolve(__dirname, './config.js'), transformConfig.code)
          // @ts-ignore
          const config = await import('./config.js')
          // @ts-ignore
          unlink(resolve(__dirname, './config.js'), () => {})
          const configSource = bindWindow(globalConfigName, config.default)
          // 注入html
          const htmlTemplate = compilation.assets[templateHtmlName]
          if (!htmlTemplate || !htmlTemplate.source) throw new Error(`请检查文件${templateHtmlName}是否存在`)
          let $ = load(htmlTemplate.source())
          $('body').prepend(`<script src="${globalConfigName}.js"></script>`)
          const htmlSource = $.html()
          // 修改输出文件
          compilation.assets = {
            [`${globalConfigName}.js`]: {
              source () {
                return configSource
              },
              size () {
                return configSource.length
              },
            },
            [templateHtmlName]: {
              source () {
                return htmlSource
              },
              size () {
                return htmlSource.length
              },
            },
          }
        }
      } catch (e) {
        let errMsg = e.message
        if (e.errno === -4058) errMsg = `请检查文件${globalConfigFilePath}是否存在`
        return console.log('错误: ' + chalk.red(errMsg))
      }
    })
  }
}

export default GlobalConfigWebpackPlugin

/**
 * 绑定window对象
 *
 * @param {string} globalName 全局配置key名称
 * @param {string} config 配置对象
 */
function bindWindow (globalName: string, config: {}) {
  return format(
    `;(function () {
      window.${globalName} = ${JSON.stringify(config, null, 2)}
    })(window)`
  )
}

console.log(process.cwd())
