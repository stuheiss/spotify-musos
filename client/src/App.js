import React, { Component } from 'react'
import './App.css'
import ReactTable from 'react-table'
import 'react-table/react-table.css'
import SpotifyWebApi from 'spotify-web-api-js'
import logo from './logo.svg'
const spotifyApi = new SpotifyWebApi()

const Task = require('data.task')
const { List } = require('immutable-ext')
//const { Pair, Sum } = require('./monoid')
const Either = require('data.either')

class App extends Component {
  constructor() {
    super()
    const params = this.getHashParams()
    const token = params.access_token
    if (token) {
      spotifyApi.setAccessToken(token)
    }
    this.state = {
      loggedIn: token ? true : false,
      nowPlaying: { name: 'Not Checked', albumArt: '' },
      artist: '',
      genres: '',
      patterns: [],
      related: [],
      error: ''
    }
    this.handleChangeArtist = this.handleChangeArtist.bind(this)
    this.handleSubmitArtist = this.handleSubmitArtist.bind(this)
    this.handleChangeGenres = this.handleChangeGenres.bind(this)
    this.handleSubmitGenres = this.handleSubmitGenres.bind(this)
  }

  handleChangeArtist(event) {
    this.setState({ artist: event.target.value })
  }

  handleSubmitArtist(event) {
    this.dataflow(this.state.artist)
    event.preventDefault()
  }

  handleChangeGenres(event) {
    this.setState({ genres: event.target.value })
  }

  handleSubmitGenres(event) {
    this.dataflow(this.state.artist)
    event.preventDefault()
  }

  dataflow(query) {
    if (!query) return

    // split a comma separated string into an array
    const strSplitOnComma = s => s.split(',').map(s => s.trim())

    const names = new Task((rej, res) => res(strSplitOnComma(query)))

    const first = xs => Either.fromNullable(xs[0])

    const eitherToTask = e => e.fold(Task.rejected, Task.of)

    const searchArtistsTask = query =>
      new Task((rej, res) => spotifyApi.searchArtists(query).then(res, rej))

    const relatedArtistsTask = id =>
      new Task((rej, res) =>
        spotifyApi.getArtistRelatedArtists(id).then(res, rej)
      )

    const findArtist = query =>
      searchArtistsTask(query)
        .map(result => result.artists.items)
        .map(first)
        .chain(eitherToTask)

    const relatedArtists = id =>
      relatedArtistsTask(id).map(result => result.artists)

    // remove one level of array nesting
    const flatten = xs => xs.reduce((acc, cur) => acc.concat(cur), [])

    const related = name =>
      findArtist(name)
        .map(artist => artist.id)
        .chain(relatedArtists)

    const dumper = x => {
      console.log(x)
      return x
    }

    const id = x => x

    // filter function matches by genre
    const byGenres = artist => {
      if (!this.state.genres) return true // no filtering
      const subpats = strSplitOnComma(this.state.genres).join('|')
      //const pattern = `^(${subpats})$` // anchored
      const pattern = `(${subpats})` // not anchored
      const matches = artist.genres.filter(el =>
        new RegExp(pattern, 'i').test(el)
      )
      return matches.length > 0
    }

    const main = names =>
      List(names)
        .traverse(Task.of, related)
        .map(artists =>
          flatten(artists)
            .filter(byGenres)
            .map(artist => ({
              name: artist.name,
              id: artist.id,
              popularity: artist.popularity,
              genres: artist.genres,
              image: artist.images[0] ? artist.images[0].url : '',
              spotify: artist.external_urls.spotify
            }))
        )

    // post-process dataflow results
    const process = xs => {
      const rels = xs.reduce((acc, cur) => {
        let cnt = acc[cur.name] && acc[cur.name].count ? acc[cur.name].count : 0
        acc[cur.name] = Object.assign(cur, { count: cnt + 1 })
        return acc
      }, {})
      const relsAry = Object.values(rels).map(el =>
        Object.assign(el, { score: el.count * el.popularity })
      )

      this.setState({
        related: relsAry
      })
    }

    const saverror = error => {
      this.setState({
        error: error
      })
    }

    // run it
    names.chain(main).fork(saverror, process)
  }

  getHashParams() {
    var hashParams = {}
    var e,
      r = /([^&;=]+)=?([^&;]*)/g,
      q = window.location.hash.substring(1)
    e = r.exec(q)
    while (e) {
      hashParams[e[1]] = decodeURIComponent(e[2])
      e = r.exec(q)
    }
    return hashParams
  }

  getNowPlaying() {
    spotifyApi.getMyCurrentPlaybackState().then(
      response => {
        this.setState({
          nowPlaying: {
            name: response.item.name,
            albumArt: response.item.album.images[0].url,
            artist: response.item.artists[0].name
          }
        })
      },
      error => {
        this.setState({
          error: error.responseText
        })
      }
    )
  }

  handleAddToArtists(name) {
    const artist = this.state.artist ? this.state.artist + ',' + name : name
    this.setState({ artist: artist })
  }

  relatedArtistsTableColumns() {
    return [
      {
        Header: 'Artist',
        accessor: 'name', // String-based value accessors!
        Cell: props => (
          <div>
            <button onClick={() => this.handleAddToArtists(props.value)}>
              Add
            </button>
            <br />
            <span className="text">{props.value}</span>
          </div>
        )
      },
      {
        Header: 'Count',
        accessor: 'count',
        minWidth: 50,
        Cell: props => <span className="number">{props.value}</span> // Custom cell components!
      },
      {
        Header: 'Popularity',
        accessor: 'popularity',
        minWidth: 50,
        Cell: props => <span className="number">{props.value}</span> // Custom cell components!
      },
      {
        Header: 'Score',
        accessor: 'score',
        minWidth: 50,
        Cell: props => <span className="number">{props.value}</span> // Custom cell components!
      },
      {
        Header: 'Genres',
        accessor: 'genres',
        minWidth: 200,
        className: 'genres',
        Cell: props => <span className="genres">{props.value.join(', ')}</span>
      },
      {
        Header: 'Play',
        accessor: 'image',
        Cell: row => {
          return (
            <div>
              <div>
                {row.original.image && (
                  <img alt="" height={100} src={row.original.image} />
                )}
              </div>
              <div>
                <a href={row.original.spotify}>Play</a>
              </div>
            </div>
          )
        }
      }
    ]
  }

  render() {
    const data = this.state.related
    const columns = this.relatedArtistsTableColumns()
    const loggedIn = this.state.loggedIn
    const error = this.state.error
    return (
      <div className="App">
        <header className="App-header">
          <img src={logo} className="App-logo" alt="logo" />
          <h1 className="App-title">Find Related Artists</h1>
        </header>
        {error && (
          <div className="error">
            Aw snap:{error.responseText ? error.responseText : error.toString()}
          </div>
        )}
        <a href="http://localhost:8888"> Login to Spotify </a>
        <div>
          Now Playing: {this.state.nowPlaying.name}, artist:{' '}
          {this.state.nowPlaying.artist}
        </div>
        <div>
          <img
            alt=""
            src={this.state.nowPlaying.albumArt}
            style={{ height: 150 }}
          />
        </div>
        {loggedIn && (
          <button onClick={() => this.getNowPlaying()}>
            Check Now Playing
          </button>
        )}
        {loggedIn && (
          <div>
            <div>
              <form onSubmit={this.handleSubmitArtist}>
                <label>
                  Artists:
                  <input
                    style={{ width: '370px', fontSize: '20px' }}
                    type="text"
                    value={this.state.artist}
                    onChange={this.handleChangeArtist}
                  />
                </label>
                <input type="submit" value="Submit" />
              </form>
            </div>
            <div>
              <form onSubmit={this.handleSubmitGenres}>
                <label>
                  Genres:
                  <input
                    style={{ width: '370px', fontSize: '20px' }}
                    type="text"
                    value={this.state.genres}
                    onChange={this.handleChangeGenres}
                  />
                </label>
                <input type="submit" value="Submit" />
              </form>
            </div>
            <div>Related count: {this.state.related.length}</div>

            <div>
              <ReactTable pageSize={50} data={data} columns={columns} />
            </div>
          </div>
        )}
      </div>
    )
  }
}

export default App
